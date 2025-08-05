import * as Api from "@hang/api/client";
import { Connection, type Moq, Publish, Watch } from "@kixelated/hang";
import { Path } from "@kixelated/moq";
import { Effect, Signal } from "@kixelated/signals";
import type { Canvas } from "../canvas";
import Settings from "../settings";
import { Broadcast } from "./broadcast";
import { Vector } from "./geometry";
import { Notifications } from "./notifications";

export type RoomProps = {
	name?: string;
	user?: string;
	avatar?: string;
	visible?: boolean;
};

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection;

	api: Api.Client;

	// The name of the room.
	name: Signal<string | undefined>;

	// The user ID of the local user.
	user: Signal<string | undefined>;

	// The avatar of the local user.
	avatar: Signal<string>;

	// All of the broadcasts stored in z-index order.
	broadcasts = new Signal<Broadcast[]>([]);

	// Local broadcasts.
	#locals = new Map<string, Broadcast<Publish.Broadcast>>();

	// Remote broadcasts are stored separately so we treat them differently.
	#remotes = new Map<string, Broadcast<Watch.Broadcast>>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: Canvas;

	#hovering: Broadcast | undefined = undefined;
	#dragging?: Broadcast;
	#scale = 1.0;

	// When true, the AudioContext is suspended so we can't even visualize audio.
	// I really don't understand why browsers do this.
	suspended: Signal<boolean>;

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

	#signals = new Effect();

	constructor(canvas: Canvas, api: Api.Client, props?: RoomProps) {
		this.connection = new Connection();
		this.api = api;
		this.canvas = canvas;
		this.name = new Signal(props?.name);
		this.user = new Signal(props?.user);
		this.avatar = new Signal(props?.avatar ?? Api.randomAvatar());

		this.notifications = new Notifications();

		this.#signals.effect((effect) => {
			const name = effect.get(this.name);
			if (!name) return;

			// Given the room name, fetch a cooresponding token from the API server.
			effect.spawn(async () => {
				const response = await this.api.routes.room[":name"].join.$post({ param: { name } });
				if (!response.ok) {
					throw new Error(`Failed to join room: ${response.statusText}`);
				}
				const data = await response.json();

				// Set the name of the broadcasts to our account ID.
				// If anonymous, then this is randomly generated.
				this.camera.name.set(Path.from(data.account, "camera"));
				this.screen.name.set(Path.from(data.account, "screen"));

				this.connection.url.set(new URL(data.url));
				effect.cleanup(() => this.connection.url.set(undefined));
			});
		});

		this.camera = new Publish.Broadcast(this.connection, {
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
					// mono is fine? for microphone audio.
					channelCount: { ideal: 1, max: 2 },
					echoCancellation: Settings.headphones.peek() ? { exact: false } : { ideal: true },
					autoGainControl: { ideal: true },
					noiseSuppression: { ideal: true },
				},
				vad: true, // Always enable VAD because it's cheap.
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
			},
			// A public preview for unauthenticated users.
			preview: {
				enabled: true,
			},
		});

		// Enable transcription when the setting is enabled.
		// The publisher is responsible for transcribing, regardless of if they want to display captions.
		this.#signals.subscribe(Settings.captureCaptions, (transcription) => {
			this.camera.audio.transcribe.set(transcription);
		});

		// Apply echo cancellation based on the headphones setting.
		this.#signals.effect((effect) => {
			const headphones = effect.get(Settings.headphones);
			this.camera.audio.constraints.set((prev) => ({
				...prev,
				echoCancellation: headphones ? { exact: false } : { ideal: true },
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

		this.screen = new Publish.Broadcast(this.connection, {
			device: "screen",
			audio: {
				enabled: false,
				constraints: {
					channelCount: { ideal: 2, max: 2 },
					// Disable audio processing primarily for music playback.
					autoGainControl: { ideal: false },
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
			// A public preview for unauthenticated users.
			preview: {
				enabled: true,
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
			this.camera.preview.info.set((prev) => ({ ...prev, name: user }));
			this.screen.preview.info.set((prev) => ({ ...prev, name: user ? `${user} (Screen)` : undefined }));

			this.camera.enabled.set(true);
			effect.cleanup(() => this.camera.enabled.set(false));
		});

		this.camera.signals.effect((effect) => {
			const avatar = effect.get(this.avatar);
			if (!avatar) return;

			this.camera.user.set((prev) => ({ ...prev, avatar }));
			this.screen.user.set((prev) => ({ ...prev, avatar }));
			this.camera.preview.info.set((prev) => ({ ...prev, avatar }));
			this.screen.preview.info.set((prev) => ({ ...prev, avatar }));
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.message);
			this.camera.preview.info.set((prev) => ({
				...prev,
				chat: !!message,
			}));
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.message);
			if (!message) return;

			// Clear the message after 5 seconds.
			effect.timer(() => {
				this.camera.chat.message.set(undefined);
			}, 5000);
		});

		// Monitor VAD signal with some debouncing
		this.camera.signals.effect((effect) => {
			const speaking = effect.get(this.camera.audio.speaking);

			// NOTE: The timer will get cleared when the effect is run again.
			// So it has to stay set for at least 100ms or unset for 1000ms.
			effect.timer(
				() => {
					this.camera.preview.info.set((prev) => ({
						...prev,
						speaking,
					}));
				},
				speaking ? 100 : 1000,
			);
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
			const video = effect.get(this.camera.video.media);
			const audio = effect.get(this.camera.audio.media);

			this.camera.preview.info.set((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		this.screen.signals.effect((effect) => {
			const video = effect.get(this.screen.video.media);
			const audio = effect.get(this.screen.audio.media);

			this.screen.preview.info.set((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		// Initialize chat status as false
		this.camera.preview.info.set((prev) => ({
			...prev,
			chat: false,
			speaking: false,
		}));
		this.screen.preview.info.set((prev) => ({
			...prev,
			chat: false,
			speaking: false,
		}));

		this.screen.signals.effect((effect) => {
			const user = effect.get(this.user);
			if (!user) return;

			const active = !!effect.get(this.screen.video.media) || !!effect.get(this.screen.audio.media);
			if (!active) return;

			this.screen.enabled.set(true);
			effect.cleanup(() => this.screen.enabled.set(false));
		});

		// Check if the user needs to click the page to unmute the audio.
		// TODO do this in a UI element.
		this.suspended = new Signal(this.notifications.suspended);

		window.addEventListener("mousedown", (e) => {
			const mouse = this.canvas.mousePosition(e);

			this.#dragging = undefined;

			const broadcast = this.#broadcastAt(mouse);
			if (!broadcast) return;

			if (broadcast.locked()) {
				document.body.style.cursor = "not-allowed";
				return;
			}

			const viewport = this.canvas.viewport.peek();

			// Bump the z-index unless we're already at the top.
			broadcast.targetPosition.set((prev) => ({
				...prev,
				x: mouse.x / viewport.x - 0.5,
				y: mouse.y / viewport.y - 0.5,
				z: prev.z === this.#maxZ ? this.#maxZ : ++this.#maxZ,
			}));

			document.body.style.cursor = "grabbing";
			this.#dragging = broadcast;
		});

		window.addEventListener("mousemove", (e) => {
			const mouse = this.canvas.mousePosition(e);
			const viewport = this.canvas.viewport.peek();

			if (this.#dragging) {
				// Update the position but don't publish it yet.
				this.#dragging.targetPosition.set((prev) => ({
					...prev,
					x: mouse.x / viewport.x - 0.5,
					y: mouse.y / viewport.y - 0.5,
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
					const mouse = this.canvas.mousePosition(e);

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

		// Don't download audio if the AudioContext is suspended.
		// TODO Move this to a separate class.
		this.#signals.subscribe(this.suspended, (suspended) => {
			for (const broadcast of this.#remotes.values()) {
				broadcast.source.audio.enabled.set(!suspended);
			}
		});

		this.#signals.effect(this.#init.bind(this));

		// This is a bit of a hack, but register our render method.
		this.canvas.onRender = this.#tick.bind(this);
		this.#signals.cleanup(() => {
			this.canvas.onRender = undefined;
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

				if (update.name === this.camera.name.peek()) {
					if (update.active) {
						this.#startPreview(update.name, this.camera);
					} else {
						this.#stopBroadcast(update.name);
					}
					continue;
				}

				if (update.name === this.screen.name.peek()) {
					if (update.active) {
						this.#startPreview(update.name, this.screen);
					} else {
						this.#stopBroadcast(update.name);
					}
					continue;
				}

				if (update.active) {
					// Check if we already have a broadcast for this path to prevent duplicates
					if (this.#remotes.has(update.name)) {
						console.error("Duplicate broadcast for path:", update.name);
						continue;
					}

					const watch = new Watch.Broadcast(this.connection, {
						enabled: true,
						name: update.name,
						reload: false,
						// Download the location of the broadcaster.
						location: { enabled: true },
						// Download the chat of the broadcaster.
						chat: { enabled: true },
					});

					// Download captions when the setting is enabled.
					watch.signals.subscribe(Settings.renderCaptions, (closedCaptions) => {
						watch.audio.transcribe.set(closedCaptions);
					});

					// Download video when the canvas is visible.
					watch.signals.subscribe(this.canvas.visible, (visible) => {
						watch.video.enabled.set(visible);
					});

					// Download audio when the AudioContext is not suspended.
					watch.signals.subscribe(this.suspended, (suspended) => {
						watch.audio.enabled.set(!suspended);
					});

					const broadcast = new Broadcast(watch, {
						viewport: this.canvas.viewport,
						camera: this.camera,
						screen: this.screen,
						audio: {
							notifications: this.notifications,
						},
						online: true,
					});

					this.#remotes.set(update.name, broadcast);
					this.notifications.play("sup");
					this.#startBroadcast(broadcast);
				} else {
					this.#stopBroadcast(update.name);
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

	#startPreview(name: string, source: Publish.Broadcast): Broadcast {
		const broadcast = new Broadcast(source, {
			viewport: this.canvas.viewport,
			audio: {
				notifications: this.notifications,
			},
			// Wait until we get an announcement before rendering ourselves as online.
			online: false,
		});

		this.#locals.set(name, broadcast);

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

	#stopBroadcast(name: string) {
		const broadcast = this.broadcasts.peek().find((b) => b.source.name.peek() === name);
		if (!broadcast) {
			console.warn("stopping unknown broadcast:", name);
			return;
		}

		this.notifications.play("bye");
		this.#remotes.delete(name);
		this.#locals.delete(name);

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

	#tick(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
		try {
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

			this.#render(ctx, now);
		} catch (err) {
			console.error("tick error", err);
		}
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

	#render(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
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
		for (const broadcast of this.#locals.values()) {
			broadcast.renderLocator(now, ctx);
		}
	}

	#tickScale() {
		const broadcasts = this.broadcasts.peek();
		if (broadcasts.length === 0) {
			// Avoid division by zero.
			return;
		}

		const canvasArea = this.canvas.viewport.peek().area();

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
