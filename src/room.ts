import { Connection, Moq, Publish, Watch } from "@kixelated/hang";
import { Signal, Signals, cleanup, signal } from "@kixelated/signals";
import { Broadcast } from "./broadcast";
import { Vector } from "./geometry";
import Settings from "./settings";
import { Notifications } from "./notifications";
import { renderBackground } from "./background";

export type RoomProps = {
	user?: string;
	visible?: boolean;
	volume?: number;
	muted?: boolean;
};

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection;

	// The user ID of the local user.
	user: Signal<string | undefined>;

	// All of the broadcasts stored in z-index order.
	broadcasts = signal<Broadcast[]>([]);

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

	// When true, no audio will be emitted.
	muted: Signal<boolean>;

	// The volume of the audio being emitted.
	volume: Signal<number>;

	// When false, no video will be downloaded or rendered.
	visible: Signal<boolean>;

	// The last volume that was set.
	// This is used to restore the volume on unmute.
	#unmuteVolume = 0.5;

	// The highest z-index of any broadcast that we've seen.
	#maxZ = 0;

	// The keys that are currently being held down.
	#keysDown = new Set<string>();

	// The local broadcasts.
	// The camera/avatar is always published while the screen share is conditionally published.
	camera: Broadcast<Publish.Broadcast>;
	screen: Broadcast<Publish.Broadcast>;

	// Notifications use a shared AudioContext.
	#notifications: Notifications;

	#signals = new Signals();

	constructor(connection: Connection, canvas: HTMLCanvasElement, props?: RoomProps) {
		this.connection = connection;
		this.canvas = canvas;
		this.muted = signal(props?.muted ?? false);
		this.visible = signal(props?.visible ?? true);
		this.volume = signal(props?.volume ?? 0.5);
		this.viewport = signal(Vector.create(canvas.width, canvas.height));
		this.user = signal(props?.user);

		this.#notifications = new Notifications({
			volume: this.volume,
			muted: this.muted,
		});

		const camera = new Publish.Broadcast(connection, {
			device: "camera",
			// Publish our camera's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				// Allow other users to move our camera.
				peering: Settings.draggable.get(),
			},
			user: {
				name: props?.user,
				avatar: "/avatar/kixel.png",
			},
			chat: {
				enabled: true,
				ttl: 10000, // Save messages for at most 10 seconds.
			},
		});
		this.camera = new Broadcast(camera, {
			viewport: this.viewport,
			audio: {
				notifications: this.#notifications.broadcast(),
				muted: this.muted,
				volume: this.volume,
			},
		});

		const screen = new Publish.Broadcast(connection, {
			device: "screen",
			user: {
				name: props?.user ? `${props?.user} (Screen)` : undefined,
				avatar: "/avatar/kixel.png",
			},
			// Publish our screen's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				// Allow other users to move our screen.
				peering: Settings.draggable.get(),
			},
		});
		this.screen = new Broadcast(screen, {
			viewport: this.viewport,
			audio: {
				notifications: this.#notifications.broadcast(),
				muted: this.muted,
				volume: this.volume,
			},
		});

		// Update everything when a username is selected.
		camera.signals.effect(() => {
			const user = this.user.get();
			if (!user) return;

			// Update the username
			camera.user.set((prev) => ({ ...prev, name: user }));
			screen.user.set((prev) => ({ ...prev, name: user ? `${user} (Screen)` : undefined }));

			camera.enabled.set(true);
			cleanup(() => camera.enabled.set(false));

			const path = `${user}/camera.hang`;
			camera.path.set(path);

			this.#startBroadcast(this.camera);
			cleanup(() => this.#stopBroadcast(this.camera));
		});

		// When the media source changes, bump the z-index to the highest known value.
		camera.signals.effect(() => {
			if (!camera.enabled.get()) return;
			if (!camera.video.media.get() && !camera.audio.media.get()) return;
			this.camera.setLocation({
				z: ++this.#maxZ,
			});
		});

		// When the media source changes, bump the z-index to the highest known value.
		screen.signals.effect(() => {
			if (!screen.enabled.get()) return;
			if (!screen.video.media.get() && !screen.audio.media.get()) return;
			this.screen.setLocation({
				z: ++this.#maxZ,
			});
		});

		screen.signals.effect(() => {
			const user = this.user.get();
			if (!user) return;

			const active = !!screen.video.media.get() || !!screen.audio.media.get();
			if (!active) return;

			const path = `${user}/screen.hang`;
			screen.path.set(path);

			screen.enabled.set(true);
			cleanup(() => screen.enabled.set(false));

			this.#startBroadcast(this.screen);
			cleanup(() => this.#stopBroadcast(this.screen));
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
		this.suspended = signal(this.#notifications.suspended);

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

			const broadcast = this.#broadcastAt(mouse);
			this.#dragging = broadcast;
			if (!broadcast) return;

			// Bump the z-index unless we're already at the top.
			const z = broadcast.z.peek() === this.#maxZ ? this.#maxZ : ++this.#maxZ;

			broadcast.setLocation({
				x: mouse.x / this.canvas.width - 0.5,
				y: mouse.y / this.canvas.height - 0.5,
				z,
			});

			if (broadcast.locked()) {
				this.canvas.style.cursor = "not-allowed";
			} else {
				this.canvas.style.cursor = "grabbing";
			}
		});

		window.addEventListener("mousemove", (e) => {
			const mouse = mousePosition(e);

			if (this.#dragging) {
				this.#dragging.setLocation({
					x: mouse.x / this.canvas.width - 0.5,
					y: mouse.y / this.canvas.height - 0.5,
				});
				return;
			}

			const broadcast = this.#broadcastAt(mouse);
			if (broadcast) {
				this.#hovering = broadcast;

				if (!broadcast.locked()) {
					this.canvas.style.cursor = "grab";
				}
			} else {
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
			}
		});

		window.addEventListener("mouseup", () => {
			if (this.#dragging) {
				this.#dragging = undefined;
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
			}
		});

		window.addEventListener("mouseleave", () => {
			if (this.#dragging) {
				this.#dragging = undefined;
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
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
				}

				if (broadcast.locked()) {
					this.canvas.style.cursor = "not-allowed";
					return;
				}

				const scale = e.deltaY * 0.001;
				if (scale < 0) {
					this.canvas.style.cursor = "zoom-out";
				} else if (scale > 0) {
					this.canvas.style.cursor = "zoom-in";
				}

				const location = broadcast.source.location.current.peek();

				// Bump the z-index unless we're already at the top.
				const z = broadcast.z.peek() === this.#maxZ ? this.#maxZ : ++this.#maxZ;

				broadcast.setLocation({
					scale: Math.max(Math.min((location?.scale ?? 1) + scale, 4), 0.25),
					z,
				});
			},
			{ passive: false },
		);

		// Determine when the user has interacted with the page so we can potentially unmute audio.
		const unsuspend = () => {
			this.suspended.set(false);
			this.#notifications.resume();
		};

		window.addEventListener("click", unsuspend, { once: true });
		window.addEventListener("keydown", unsuspend, { once: true });

		window.addEventListener("keydown", (e) => {
			// Only handle arrows when no text input is focused
			if (
				document.activeElement instanceof HTMLInputElement ||
				document.activeElement instanceof HTMLTextAreaElement ||
				document.activeElement?.getAttribute("contenteditable") === "true"
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
		this.#signals.effect(() => {
			const visible = this.visible.get();
			if (!visible) return;

			this.#animation = requestAnimationFrame(this.#tick.bind(this));
			return () => cancelAnimationFrame(this.#animation ?? 0);
		});

		// Apply the visible signal to remote broadcasts.
		this.#signals.effect(() => {
			const visible = this.visible.get();

			for (const broadcast of this.#remotes.values()) {
				broadcast.source.video.enabled?.set(visible);
			}
		});

		// Apply the muted signal to the broadcasts.
		// NOTE: We don't pause audio so we still get visualizations.
		this.#signals.effect(() => {
			const muted = this.muted.get();
			for (const broadcast of this.#remotes.values()) {
				broadcast.source.audio.enabled.set(muted);
			}
		});

		// Don't download audio if the AudioContext is suspended.
		this.#signals.effect(() => {
			const suspended = this.suspended.get();
			for (const broadcast of this.#remotes.values()) {
				broadcast.source.audio.enabled.set(!suspended);
			}
		});

		// Set the volume to 0 when muted.
		this.#signals.effect(() => {
			const muted = this.muted.get();
			if (muted) {
				this.#unmuteVolume = this.volume.peek() || 0.5;
				this.volume.set(0);
			} else {
				this.volume.set(this.#unmuteVolume);
			}
		});

		// Set unmute when the volume is non-zero.
		this.#signals.effect(() => {
			const volume = this.volume.get();
			this.muted.set(volume === 0);
		});

		this.#signals.effect(() => this.#init());
	}

	#init() {
		const connection = this.connection.established.get();
		if (!connection) return;

		const announced = connection.announced();
		cleanup(() => announced.close());

		void this.#runRemotes(announced);
	}

	async #runRemotes(announced: Moq.AnnouncedConsumer) {
		try {
			for (;;) {
				const update = await announced.next();

				// We're donezo.
				if (!update) break;

				if (update.path === this.camera.source.path.peek() || update.path === this.screen.source.path.peek()) {
					continue;
				}

				console.debug("new broadcast:", update.path);

				const existing = this.#remotes.get(update.path);
				this.#remotes.delete(update.path);

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
						camera: this.camera.source,
						screen: this.screen.source,
						audio: {
							notifications: this.#notifications.broadcast(),
							muted: this.muted,
							volume: this.volume,
						},
					});

					this.#remotes.set(update.path, broadcast);
					this.#startBroadcast(broadcast);
				} else if (existing) {
					this.#stopBroadcast(existing);
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

	#startBroadcast(broadcast: Broadcast) {
		// Put new broadcasts on top of the stack.
		// NOTE: This is not sent over the network because we did not update source.location.current.z.
		broadcast.z.set(++this.#maxZ);
		broadcast.audio.notifications.play("sup");

		// Insert the broadcast into the room based on it's z-index.
		this.broadcasts.set((prev) => [...prev, broadcast]);

		// Resort the broadcasts when the z-index changes.
		broadcast.signals.effect(() => {
			// Get our z-index so we resort when it changes.
			const z = broadcast.z.get();
			if (z > this.#maxZ) {
				// Save the higher z-index so we can use it for new broadcasts.
				this.#maxZ = z;
			}

			this.broadcasts.set((prev) =>
				prev.sort(
					// Peek at the other broadcasts' z-index to avoid re-sorting every time.
					(a, b) => a.z.peek() - b.z.peek(),
				),
			);
		});
	}

	#stopBroadcast(broadcast: Broadcast) {
		// Stop downloading it.
		broadcast.source.enabled.set(false);
		broadcast.audio.notifications.play("bye");

		// Move it from the main list to the rip list.
		this.broadcasts.set((prev) => prev.filter((b) => b !== broadcast));
		this.#rip.push(broadcast);

		// Slowly fade out the offline broadcast.
		const fade = () => {
			broadcast.online -= 0.01;
			if (broadcast.online > 0) {
				requestAnimationFrame(fade);
				return;
			}

			this.#rip.splice(this.#rip.indexOf(broadcast), 1);

			// Don't close local broadcasts, we keep them open and toggle instead.
			if (broadcast.source instanceof Watch.Broadcast) {
				broadcast.close();
			}
		};

		requestAnimationFrame(fade);
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

		const position = this.camera.source.location.current.peek();
		if (position) {
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

			this.camera.setLocation(position);
		}
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

		for (const broadcast of this.#rip) {
			ctx.save();
			ctx.globalAlpha *= broadcast.online; // Fade the opacity when the broadcaster is offline.
			broadcast.video.render(now, ctx);
			ctx.restore();
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
		this.camera.renderLocator(now, ctx);
		this.screen.renderLocator(now, ctx);
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

		// If we're the only broadcaster, then don't make our avatar huge.
		if (broadcasts.length <= 1) {
			broadcastArea *= 2;
		}

		const fillRatio = broadcastArea / canvasArea;
		const targetFill = 0.25;

		this.#scale = Math.sqrt(targetFill / fillRatio);
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
		this.#notifications.close();
	}
}
