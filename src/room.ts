import { type Connection, type Moq, Publish, Watch } from "@kixelated/hang";
import { type Effect, Root, Signal } from "@kixelated/signals";
import { getDefaultAvatar } from "./avatar";
import { renderBackground } from "./background";
import { Broadcast } from "./broadcast";
import { Vector } from "./geometry";
import { Notifications } from "./notifications";
import Settings from "./settings";

export type RoomProps = {
	user?: string;
	avatar?: string;
	visible?: boolean;
};

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection;

	// The user ID of the local user.
	user: Signal<string | undefined>;

	// The avatar of the local user.
	avatar: Signal<string>;

	// All of the broadcasts stored in z-index order.
	broadcasts = new Signal<Broadcast[]>([]);

	// Remote broadcasts are stored separately so we treat them differently.
	#remotes = new Map<string, Broadcast<Watch.Broadcast>>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: HTMLCanvasElement;
	viewport: Signal<Vector>; // The canvas size

	#ctx: CanvasRenderingContext2D;
	#animation: number | undefined;

	#hovering: Broadcast | undefined = undefined;
	#dragging?: Broadcast;
	#scale = 1.0;

	// When true, the AudioContext is suspended so we can't even visualize audio.
	// I really don't understand why browsers do this.
	suspended: Signal<boolean>;

	// When false, no video will be downloaded or rendered.
	visible: Signal<boolean>;

	// The highest z-index of any broadcast that we've seen.
	#maxZ = 0;

	// The keys that are currently being held down.
	#keysDown = new Set<string>();

	// The local broadcasts.
	// The camera/avatar is always published while the screen share is conditionally published.
	camera: Publish.Broadcast;
	screen: Publish.Broadcast;

	// Notifications use a shared AudioContext.
	notifications: Notifications;

	#signals = new Root();

	constructor(connection: Connection, canvas: HTMLCanvasElement, props?: RoomProps) {
		this.connection = connection;
		this.canvas = canvas;
		this.visible = new Signal(props?.visible ?? true);
		this.viewport = new Signal(Vector.create(canvas.width, canvas.height));
		this.user = new Signal(props?.user);
		this.avatar = new Signal(props?.avatar ?? getDefaultAvatar());

		this.notifications = new Notifications();

		this.camera = new Publish.Broadcast(connection, {
			device: "camera",
			video: {
				enabled: false, // TODO local storage?
				constraints: {
					// 480p but square, so the browser can choose the best aspect ratio.
					width: { ideal: 640 },
					height: { ideal: 640 },
					frameRate: { ideal: 60 },
					facingMode: { ideal: "user" },
					resizeMode: "none",
				},
			},
			audio: {
				enabled: false, // TODO automatically enable the microphone on join..?
				constraints: {
					channelCount: { ideal: 2, max: 2 },
					autoGainControl: { ideal: true }, // TODO not sure if this should be enabled given we apply a gain node?
					noiseSuppression: { ideal: true },
				},
			},
			// Publish our camera's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				// Allow other users to move our camera.
				peering: Settings.draggable.peek(),
			},
			user: {
				name: props?.user,
				avatar: props?.avatar,
			},
			chat: {
				enabled: true,
				ttl: 10000, // Save messages for at most 10 seconds.
			},
		});

		// Apply echo cancellation based on the headphones setting.
		this.#signals.effect((effect) => {
			const headphones = effect.get(Settings.headphones);

			// Disable echo cancelation when we explicitly cause an echo.
			// Otherwise the browser gets very very confused, even when using headphones.
			const echo = effect.get(Settings.echo);
			const enabled = !echo && !headphones;

			this.camera.audio.constraints.set((prev) => ({
				...prev,
				echoCancellation: enabled ? { ideal: true } : { exact: false },
			}));
		});

		this.#signals.subscribe(Settings.draggable, (draggable) => {
			// Allow other users to move our camera.
			this.camera.location.peering.set(draggable);
		});

		this.#signals.effect((effect) => {
			if (effect.get(this.camera.video.media) || effect.get(this.camera.audio.media)) {
				this.notifications.play("select");
			}
		});

		this.screen = new Publish.Broadcast(connection, {
			device: "screen",
			audio: {
				enabled: false,
				constraints: {
					channelCount: { ideal: 2, max: 2 },
					autoGainControl: { ideal: true }, // TODO test it?
					// Just to be safe:
					echoCancellation: { ideal: false },
					noiseSuppression: { ideal: false },
				},
			},
			video: {
				enabled: false,
				constraints: {
					frameRate: { ideal: 60 },
					resizeMode: "none",
				},
			},
			user: {
				name: props?.user ? `${props?.user} (Screen)` : undefined,
				avatar: props?.avatar,
			},
			// Publish our screen's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
			},
		});

		this.#signals.subscribe(Settings.draggable, (draggable) => {
			// Allow other users to move our screen.
			this.screen.location.peering.set(draggable);
		});

		this.#signals.effect((effect) => {
			if (effect.get(this.screen.video.media) || effect.get(this.screen.audio.media)) {
				this.notifications.play("select");
			}
		});

		// Update everything when a username is selected.
		this.camera.signals.effect((effect) => {
			const user = effect.get(this.user);
			if (!user) return;

			// Update the username
			this.camera.user.set((prev) => ({ ...prev, name: user }));
			this.screen.user.set((prev) => ({ ...prev, name: user ? `${user} (Screen)` : undefined }));

			this.camera.enabled.set(true);
			effect.cleanup(() => this.camera.enabled.set(false));

			const path = `${user}/camera.hang`;
			this.camera.path.set(path);
		});

		this.camera.signals.effect((effect) => {
			const avatar = effect.get(this.avatar);
			if (!avatar) return;

			this.camera.user.set((prev) => ({ ...prev, avatar }));
			this.screen.user.set((prev) => ({ ...prev, avatar }));
		});

		// When the media source changes, bump the z-index to the highest known value.
		this.camera.signals.effect((effect) => {
			if (!effect.get(this.camera.enabled)) return;
			if (!effect.get(this.camera.video.media) && !effect.get(this.camera.audio.media)) return;

			this.camera.location.current.set((prev) => ({
				...prev,
				z: ++this.#maxZ,
			}));
		});

		// When the media source changes, bump the z-index to the highest known value.
		this.screen.signals.effect((effect) => {
			if (!effect.get(this.screen.enabled)) return;
			if (!effect.get(this.screen.video.media) && !effect.get(this.screen.audio.media)) return;

			this.screen.location.current.set((prev) => ({
				...prev,
				z: ++this.#maxZ,
			}));
		});

		this.screen.signals.effect((effect) => {
			const user = effect.get(this.user);
			if (!user) return;

			const active = !!effect.get(this.screen.video.media) || !!effect.get(this.screen.audio.media);
			if (!active) return;

			const path = `${user}/screen.hang`;
			this.screen.path.set(path);

			this.screen.enabled.set(true);
			effect.cleanup(() => this.screen.enabled.set(false));
		});

		const resize = () => {
			this.canvas.width = window.devicePixelRatio * window.innerWidth;
			this.canvas.height = window.devicePixelRatio * window.innerHeight;
			this.viewport.set(Vector.create(this.canvas.width, this.canvas.height));
		};

		const visible = () => {
			this.visible.set(document.visibilityState !== "hidden");
		};

		resize();
		visible();

		window.addEventListener("resize", resize);
		document.addEventListener("visibilitychange", visible);

		this.#signals.cleanup(() => {
			window.removeEventListener("resize", resize);
			document.removeEventListener("visibilitychange", visible);
		});

		// Check if the user needs to click the page to unmute the audio.
		// TODO do this in a UI element.
		this.suspended = new Signal(this.notifications.suspended);

		const ctx = this.canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get canvas context");
		}

		this.#ctx = ctx;

		const mousePosition = (e: MouseEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			return Vector.create(e.clientX - rect.left, e.clientY - rect.top).mult(window.devicePixelRatio);
		};

		window.addEventListener("mousedown", (e) => {
			const mouse = mousePosition(e);

			this.#dragging = undefined;

			const broadcast = this.#broadcastAt(mouse);
			if (!broadcast) return;

			if (broadcast.locked()) {
				document.body.style.cursor = "not-allowed";
				return;
			}

			// Bump the z-index unless we're already at the top.
			broadcast.targetPosition.set((prev) => ({
				...prev,
				x: mouse.x / this.canvas.width - 0.5,
				y: mouse.y / this.canvas.height - 0.5,
				z: prev.z === this.#maxZ ? this.#maxZ : ++this.#maxZ,
			}));

			document.body.style.cursor = "grabbing";
			this.#dragging = broadcast;
		});

		window.addEventListener("mousemove", (e) => {
			const mouse = mousePosition(e);

			if (this.#dragging) {
				// Update the position but don't publish it yet.
				this.#dragging.targetPosition.set((prev) => ({
					...prev,
					x: mouse.x / this.canvas.width - 0.5,
					y: mouse.y / this.canvas.height - 0.5,
				}));
				return;
			}

			const broadcast = this.#broadcastAt(mouse);
			if (broadcast) {
				this.#hovering = broadcast;

				if (!broadcast.locked()) {
					document.body.style.cursor = "grab";
				}
			} else {
				this.#hovering = undefined;
				document.body.style.cursor = "default";
			}
		});

		window.addEventListener("mouseup", () => {
			if (this.#dragging) {
				this.#dragging.publishPosition();

				this.#dragging = undefined;
				this.#hovering = undefined;
				document.body.style.cursor = "default";
			}
		});

		window.addEventListener("mouseleave", () => {
			if (this.#dragging) {
				this.#dragging.publishPosition();

				this.#dragging = undefined;
				this.#hovering = undefined;
				document.body.style.cursor = "default";
			}
		});

		window.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault(); // Prevent scroll

				let broadcast = this.#dragging;
				if (!broadcast) {
					const mouse = mousePosition(e);

					broadcast = this.#broadcastAt(mouse);
					if (!broadcast) return;

					this.#hovering = broadcast;

					// Bump the z-index unless we're already at the top.
					broadcast.targetPosition.set((prev) => ({
						...prev,
						z: prev.z === this.#maxZ ? this.#maxZ : ++this.#maxZ,
					}));
				}

				if (broadcast.locked()) {
					document.body.style.cursor = "not-allowed";
					return;
				}

				const scale = e.deltaY * 0.001;
				if (scale < 0) {
					document.body.style.cursor = "zoom-out";
				} else if (scale > 0) {
					document.body.style.cursor = "zoom-in";
				}

				// Update the scale, publishing it.
				broadcast.targetPosition.set((prev) => ({
					...prev,
					scale: Math.max(Math.min((prev.scale ?? 1) + scale, 4), 0.25),
				}));

				broadcast.publishPosition();
			},
			{ passive: false },
		);

		// Determine when the user has interacted with the page so we can potentially unmute audio.
		const unsuspend = () => {
			this.suspended.set(false);
			this.notifications.resume();
		};

		window.addEventListener("click", unsuspend, { once: true });
		window.addEventListener("keydown", unsuspend, { once: true });

		window.addEventListener("keydown", (e) => {
			// Only handle arrows when no text input is focused
			if (
				document.activeElement instanceof HTMLInputElement ||
				document.activeElement instanceof HTMLTextAreaElement ||
				document.activeElement?.getAttribute("contenteditable") !== null
			) {
				return;
			}

			switch (e.key) {
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown":
					// We'll actually move the camera in #tick.
					this.#keysDown.add(e.key);
					break;
				default:
					// Prevent scrolling the page.
					e.preventDefault();
			}
		});

		window.addEventListener("keyup", (e) => {
			this.#keysDown.delete(e.key);
		});

		// Only render the canvas when it's visible.
		this.#signals.effect((effect) => {
			const visible = effect.get(this.visible);
			if (!visible) return;

			this.#animation = requestAnimationFrame(this.#tick.bind(this));
			effect.cleanup(() => cancelAnimationFrame(this.#animation ?? 0));
		});

		// Apply the visible signal to remote broadcasts.
		this.#signals.subscribe(this.visible, (visible) => {
			for (const broadcast of this.#remotes.values()) {
				broadcast.source.video.enabled?.set(visible);
			}
		});

		// Don't download audio if the AudioContext is suspended.
		this.#signals.subscribe(this.suspended, (suspended) => {
			for (const broadcast of this.#remotes.values()) {
				broadcast.source.audio.enabled.set(!suspended);
			}
		});

		this.#signals.effect(this.#init.bind(this));

		// When the echo setting changes, recreate any local broadcasts.
		this.#signals.subscribe(Settings.echo, () => {
			const broadcasts = this.broadcasts.peek();

			// Recreate any previews.
			for (const broadcast of broadcasts) {
				const path = broadcast.source.path.peek();
				if (path === this.camera.path.peek()) {
					this.#stopBroadcast(path);
					this.#startPreview(this.camera);
				} else if (path === this.screen.path.peek()) {
					this.#stopBroadcast(path);
					this.#startPreview(this.screen);
				}
			}
		});
	}

	#init(effect: Effect) {
		const connection = effect.get(this.connection.established);
		if (!connection) return;

		const announced = connection.announced();
		effect.cleanup(() => announced.close());

		effect.spawn(this.#runRemotes.bind(this, announced));
	}

	async #runRemotes(announced: Moq.AnnouncedConsumer, cancel: Promise<void>) {
		try {
			for (;;) {
				const update = await Promise.race([announced.next(), cancel]);

				// We're donezo.
				if (!update) break;

				if (update.path === this.camera.path.peek()) {
					if (update.active) {
						this.#startPreview(this.camera);
					} else {
						this.#stopBroadcast(update.path);
					}
					continue;
				}

				if (update.path === this.screen.path.peek()) {
					if (update.active) {
						this.#startPreview(this.screen);
					} else {
						this.#stopBroadcast(update.path);
					}
					continue;
				}

				if (update.active) {
					const watch = new Watch.Broadcast(this.connection, {
						enabled: true,
						path: update.path,
						reload: false,
						// Download video unless the window is hidden.
						video: { enabled: this.visible.peek() },
						// Download audio unless the AudioContext is suspended.
						audio: { enabled: !this.suspended.peek() },
						// Download the location of the broadcaster.
						location: { enabled: true },
						// Download the chat of the broadcaster.
						chat: { enabled: true },
					});

					const broadcast = new Broadcast(watch, {
						viewport: this.viewport,
						camera: this.camera,
						screen: this.screen,
						audio: {
							notifications: this.notifications,
						},
						online: true,
					});

					this.#remotes.set(update.path, broadcast);
					this.notifications.play("sup");
					this.#startBroadcast(broadcast);
				} else {
					this.#stopBroadcast(update.path);
				}
			}
		} finally {
			for (const broadcast of this.#remotes.values()) {
				broadcast.close();
			}

			this.#remotes.clear();
		}
	}

	#broadcastAt(point: Vector): Broadcast | undefined {
		// Loop in reverse order to respect the z-index.
		const broadcasts = this.broadcasts.peek();
		for (let i = broadcasts.length - 1; i >= 0; i--) {
			const broadcast = broadcasts[i];
			if (broadcast.bounds.peek().contains(point)) {
				return broadcast;
			}
		}

		return undefined;
	}

	#startPreview(source: Publish.Broadcast): Broadcast {
		let broadcast: Broadcast;

		if (Settings.echo.peek()) {
			const watch = new Watch.Broadcast(this.connection, {
				enabled: true,
				path: source.path.peek(),
				reload: false,
				// Download video unless the window is hidden.
				video: { enabled: this.visible.peek() },
				// Download audio unless the AudioContext is suspended.
				audio: { enabled: !this.suspended.peek() },
				// Download the location of the broadcaster.
				location: { enabled: true },
				// Download the chat of the broadcaster.
				chat: { enabled: true },
			});

			// Replace the entry with a remote broadcast.
			broadcast = new Broadcast(watch, {
				viewport: this.viewport,
				// TODO Figure out location stuff
				camera: this.camera,
				screen: this.screen,
				audio: {
					notifications: this.notifications,
				},
				online: true,
			});
		} else {
			broadcast = new Broadcast(source, {
				viewport: this.viewport,
				audio: {
					notifications: this.notifications,
				},
				// Wait until we get an announcement before rendering ourselves as online.
				online: false,
			});
		}

		this.#startBroadcast(broadcast);

		return broadcast;
	}

	#startBroadcast(broadcast: Broadcast) {
		// Put new broadcasts on top of the stack.
		// NOTE: This is not sent over the network.
		broadcast.targetPosition.set((prev) => ({
			...prev,
			z: ++this.#maxZ,
		}));

		// Insert the broadcast into the room based on it's z-index.
		this.broadcasts.set((prev) => [...prev, broadcast]);

		broadcast.online.set(true);

		// Resort the broadcasts when the z-index changes.
		broadcast.signals.effect((effect) => {
			// Get our z-index so we resort when it changes.
			const z = effect.get(broadcast.targetPosition).z;
			if (z > this.#maxZ) {
				// Save the higher z-index so we can use it for new broadcasts.
				this.#maxZ = z;
			}

			this.broadcasts.set((prev) =>
				prev.sort(
					// Peek at the other broadcasts' z-index to avoid re-sorting every time.
					(a, b) => a.targetPosition.peek().z - b.targetPosition.peek().z,
				),
			);
		});
	}

	#stopBroadcast(path: string) {
		const broadcast = this.broadcasts.peek().find((b) => b.source.path.peek() === path);
		if (!broadcast) {
			console.warn("stopping unknown broadcast:", path);
			return;
		}

		this.notifications.play("bye");
		this.#remotes.delete(path);

		// Move it from the main list to the rip list.
		this.broadcasts.set((prev) => prev.filter((b) => b !== broadcast));
		this.#rip.push(broadcast);

		// Slowly fade out the offline broadcast.
		broadcast.online.set(false);

		// Wait for the fade to complete, roughly.
		setTimeout(() => {
			this.#rip.splice(this.#rip.indexOf(broadcast), 1);

			// Don't close local broadcasts, we keep them open and toggle instead.
			if (broadcast.source instanceof Watch.Broadcast) {
				broadcast.close();
			}
		}, 1000);
	}

	#tick(now: DOMHighResTimeStamp) {
		this.#tickScale();
		this.#tickKeyboard();

		for (const broadcast of this.#rip) {
			broadcast.tick(now, this.#scale);
		}

		const broadcasts = this.broadcasts.peek();
		for (const broadcast of broadcasts) {
			broadcast.tick(now, this.#scale);
		}

		// Check for collisions.
		// We might need to optimize this with a quadtree or something.
		for (let i = 0; i < broadcasts.length; i++) {
			const a = broadcasts[i];
			const abounds = a.bounds.peek();

			for (let j = i + 1; j < broadcasts.length; j++) {
				const b = broadcasts[j];
				const bbounds = b.bounds.peek();

				// Compute the intersection rectangle.
				const intersection = abounds.intersects(bbounds);
				if (!intersection) {
					continue;
				}

				// Repel each other based on the size of the intersection.
				const strength = (2 * intersection.area()) / (abounds.area() + bbounds.area());
				let force = abounds.middle().sub(bbounds.middle()).mult(strength);

				if (this.#dragging !== a && this.#dragging !== b) {
					force = force.mult(10);
				}

				a.velocity = a.velocity.add(force);
				b.velocity = b.velocity.sub(force);
			}
		}

		this.#render(now);

		this.#animation = requestAnimationFrame(this.#tick.bind(this));
	}

	#tickKeyboard() {
		// Update the camera's location based on the keys that are being held down.
		// TODO: Figure out a way that we can also move the screen.
		const keysDown = this.#keysDown;

		const position = this.camera.location.current.peek() ?? {};

		if (keysDown.has("ArrowLeft")) {
			position.x = Math.max((position.x ?? 0) - 0.02, -0.5);
		}

		if (keysDown.has("ArrowRight")) {
			position.x = Math.min((position.x ?? 0) + 0.02, 0.5);
		}

		if (keysDown.has("ArrowUp")) {
			position.y = Math.max((position.y ?? 0) - 0.02, -0.5);
		}

		if (keysDown.has("ArrowDown")) {
			position.y = Math.min((position.y ?? 0) + 0.02, 0.5);
		}

		this.camera.location.current.set(position);
	}

	#render(now: DOMHighResTimeStamp) {
		const ctx = this.#ctx;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		renderBackground(ctx, now);

		const broadcasts = this.broadcasts.peek();
		for (const broadcast of broadcasts) {
			broadcast.audio.renderBackground(ctx);
		}

		for (const broadcast of broadcasts) {
			broadcast.audio.render(ctx);
		}

		// Broadcasts fading out don't have collision so they're in a separate structure.
		for (const broadcast of this.#rip) {
			broadcast.video.render(now, ctx);
		}

		for (const broadcast of broadcasts) {
			if (this.#dragging !== broadcast) {
				ctx.save();
				broadcast.video.render(now, ctx, {
					hovering: this.#hovering === broadcast,
				});
				ctx.restore();
			}
		}

		// Render the dragging broadcast last so it's always on top.
		if (this.#dragging) {
			ctx.save();
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			this.#dragging.video.render(now, ctx, { dragging: true });
			ctx.restore();
		}

		// Render the locator arrows for our broadcasts on join.
		//this.camera.renderLocator(now, ctx);
		// this.screen.renderLocator(now, ctx);
	}

	#tickScale() {
		const broadcasts = this.broadcasts.peek();
		if (broadcasts.length === 0) {
			// Avoid division by zero.
			return;
		}

		const canvasArea = this.canvas.width * this.canvas.height;

		let broadcastArea = 0;
		for (const broadcast of broadcasts) {
			broadcastArea += broadcast.video.targetSize.x * broadcast.video.targetSize.y;
		}

		const fillRatio = broadcastArea / canvasArea;
		const targetFill = 0.25;

		this.#scale = Math.min(Math.sqrt(targetFill / fillRatio), 2);
	}

	close() {
		this.#signals.close();

		for (const broadcast of this.broadcasts.peek()) {
			broadcast.close();
		}

		for (const broadcast of this.#rip) {
			broadcast.close();
		}

		this.#rip = [];
		this.broadcasts.set([]);

		this.camera.close();
		this.screen.close();
		this.notifications.close();
	}
}
