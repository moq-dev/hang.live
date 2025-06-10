import { Connection, Moq, Publish, Watch } from "@kixelated/hang";
import { Signal, Signals, cleanup, signal } from "@kixelated/signals";
import { Broadcast } from "./broadcast";
import { Vector } from "./geometry";
import Settings from "./settings";
import { ReactiveMap } from "@solid-primitives/map";

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

	// All of the broadcasts keyed by their path.
	// We use the insertion order to determine the z-index.
	broadcasts = new ReactiveMap<string, Broadcast>();

	// Remote broadcasts are stored separately so we treat them differently.
	#remotes = new Map<string, Watch.Broadcast>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: HTMLCanvasElement;
	viewport: Signal<Vector>; // The canvas size

	#ctx: CanvasRenderingContext2D;
	#animation: number | undefined;

	#hovering?: Broadcast;
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

	// The local broadcasts.
	// The camera/avatar is always published while the screen share is conditionally published.
	camera: Broadcast<Publish.Broadcast>;
	screen: Broadcast<Publish.Broadcast>;

	#signals = new Signals();

	constructor(connection: Connection, canvas: HTMLCanvasElement, props?: RoomProps) {
		this.connection = connection;
		this.canvas = canvas;
		this.muted = signal(props?.muted ?? false);
		this.visible = signal(props?.visible ?? true);
		this.volume = signal(props?.volume ?? 0.5);
		this.viewport = signal(Vector.create(canvas.width, canvas.height));
		this.user = signal(props?.user);

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
				name: "John Doe",
				avatar: "https://placehold.co/100x100",
			},
			chat: {
				enabled: true,
			},
		});
		this.camera = new Broadcast(camera, this.viewport);

		const screen = new Publish.Broadcast(connection, {
			device: "screen",
			// Publish our screen's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				// Allow other users to move our screen.
				peering: Settings.draggable.get(),
			},
		});
		this.screen = new Broadcast(screen, this.viewport);

		this.#signals.effect(() => {
			const user = this.user.get();
			if (!user) return;

			camera.enabled.set(true);
			cleanup(() => camera.enabled.set(false));

			const path = `${user}/camera.hang`;
			camera.path.set(path);

			this.broadcasts.set(path, this.camera);
			cleanup(() => this.#stopBroadcast(path));
		});

		this.#signals.effect(() => {
			const user = this.user.get();
			if (!user) return;

			const active = !!screen.video.media.get() || !!screen.audio.media.get();
			if (!active) return;

			const path = `${user}/screen.hang`;
			screen.path.set(path);

			screen.enabled.set(true);
			cleanup(() => screen.enabled.set(false));

			this.broadcasts.set(path, this.screen);
			cleanup(() => this.#stopBroadcast(path));
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
		this.suspended = signal(
			(() => {
				const ctx = new AudioContext();
				const suspended = ctx.state === "suspended";
				ctx.close();
				return suspended;
			})(),
		);

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

			const at = this.#broadcastAt(mouse);
			this.#dragging = at?.broadcast;
			if (!at) return;

			// Reinsert to update the z-index.
			this.broadcasts.delete(at.name);
			this.broadcasts.set(at.name, at.broadcast);

			if (at.broadcast.locked()) {
				this.canvas.style.cursor = "not-allowed";
			} else {
				this.canvas.style.cursor = "grabbing";
				document.documentElement.classList.add("dragging");
			}
		});

		window.addEventListener("mousemove", (e) => {
			const mouse = mousePosition(e);

			if (this.#dragging) {
				this.#dragging.setLocation({
					x: mouse.x / this.canvas.width - 0.5,
					y: mouse.y / this.canvas.height - 0.5,
				});
			} else {
				const at = this.#broadcastAt(mouse);
				if (at) {
					if (!at.broadcast.locked()) {
						this.#hovering = at.broadcast;
						this.canvas.style.cursor = "grab";
					}
				} else {
					this.#hovering = undefined;
					this.canvas.style.cursor = "default";
				}
			}
		});

		window.addEventListener("mouseup", () => {
			if (this.#dragging) {
				this.#dragging = undefined;
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
				document.documentElement.classList.remove("dragging");
			}
		});

		window.addEventListener("mouseleave", () => {
			if (this.#dragging) {
				this.#dragging = undefined;
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
				document.documentElement.classList.remove("dragging");
			}
		});

		window.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault(); // Prevent scroll

				let broadcast = this.#dragging;
				if (!broadcast) {
					const mouse = mousePosition(e);

					const at = this.#broadcastAt(mouse);
					if (!at) return;

					this.#hovering = at.broadcast;
					broadcast = at.broadcast;
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

				const location = broadcast.source.location.current.get();
				broadcast.setLocation({
					...location,
					zoom: Math.max(Math.min((location?.zoom ?? 1) + scale, 4), 0.25),
				});
			},
			{ passive: false },
		);

		// Determine when the user has interacted with the page so we can potentially unmute audio.
		document.addEventListener("click", () => this.suspended.set(false), { once: true });
		document.addEventListener("keydown", () => this.suspended.set(false), { once: true });

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
				broadcast.video.enabled?.set(visible);
			}
		});

		// Apply the muted signal to the broadcasts.
		// NOTE: We don't pause audio so we still get visualizations.
		this.#signals.effect(() => {
			const muted = this.muted.get();
			for (const broadcast of this.#remotes.values()) {
				broadcast.audio.enabled.set(muted);
			}
		});

		// Don't download audio if the AudioContext is suspended.
		this.#signals.effect(() => {
			const suspended = this.suspended.get();
			for (const broadcast of this.#remotes.values()) {
				broadcast.audio.enabled.set(!suspended);
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
		for (;;) {
			const update = await announced.next();

			// We're donezo.
			if (!update) break;

			if (update.path === this.camera.source.path.peek() || update.path === this.screen.source.path.peek()) {
				continue;
			}

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

				const broadcast = new Broadcast(watch, this.viewport, {
					camera: this.camera.source,
					screen: this.screen.source,
				});

				this.#remotes.set(update.path, watch);
				this.broadcasts.set(update.path, broadcast);
			} else if (existing) {
				this.#stopBroadcast(update.path);
			}
		}

		for (const broadcast of this.#remotes.values()) {
			broadcast.close();
		}

		this.#remotes.clear();
	}

	#broadcastAt(point: Vector): { name: string; broadcast: Broadcast } | undefined {
		// We need to iterate in reverse order to respect the z-index.
		// TODO: Shoet-circuit on the first result, but that requires a reverse iterator.
		let result: { name: string; broadcast: Broadcast } | undefined;

		for (const [name, broadcast] of this.broadcasts) {
			if (broadcast.bounds.peek().contains(point)) {
				result = { name, broadcast };
			}
		}

		return result;
	}

	#stopBroadcast(path: string) {
		const broadcast = this.broadcasts.get(path);
		if (!broadcast) throw new Error(`Broadcast not found: ${path}`);

		// Stop downloading it.
		broadcast.source.enabled.set(false);

		// Move it from the main list to the rip list.
		this.broadcasts.delete(path);
		this.#rip.push(broadcast);

		// Slowly fade out the offline broadcast.
		const fade = () => {
			broadcast.online -= 0.01;

			if (broadcast.online <= 0) {
				this.#rip.splice(this.#rip.indexOf(broadcast), 1);
				broadcast.close();
			} else {
				requestAnimationFrame(fade);
			}
		};

		requestAnimationFrame(fade);
	}

	#tick(now: DOMHighResTimeStamp) {
		this.#updateScale();

		for (const broadcast of this.#rip) {
			broadcast.tick(now, this.#scale);
		}

		const broadcasts = Array.from(this.broadcasts.values());
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

	#render(now: DOMHighResTimeStamp) {
		const ctx = this.#ctx;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		this.#renderBackground(now);

		for (const broadcast of this.broadcasts.values()) {
			broadcast.audio.renderBackground(ctx);
		}

		for (const broadcast of this.broadcasts.values()) {
			broadcast.audio.render(ctx);
		}

		for (const broadcast of this.#rip) {
			ctx.save();
			ctx.globalAlpha *= broadcast.online; // Fade the opacity when the broadcaster is offline.
			broadcast.video.render(now, ctx);
			ctx.restore();
		}

		for (const broadcast of this.broadcasts.values()) {
			if (this.#dragging !== broadcast) {
				ctx.save();
				broadcast.video.render(now, ctx, {
					hovering: this.#hovering === broadcast,
				});
				ctx.restore();
			}
		}

		// Render the dragging broadcast last so it's on top.
		if (this.#dragging) {
			ctx.save();
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			this.#dragging.video.render(now, ctx, { dragging: true });
			ctx.restore();
		}

		if (this.camera.source.enabled.peek()) {
			this.camera.video.renderLocator(now, ctx);
		}

		if (this.screen.source.enabled.peek()) {
			this.screen.video.renderLocator(now, ctx);
		}
	}

	#renderBackground(now: DOMHighResTimeStamp) {
		const LINE_SPACING = 64;
		const LINE_WIDTH = 10;
		const SEGMENTS = 16;
		const WOBBLE_AMPLITUDE = 10;
		const BEND_AMPLITUDE = 16;
		const BEND_PROBABILITY = 0.2;
		const WOBBLE_SPEED = 0.0006;
		const LINE_OVERDRAW = 2;

		const ctx = this.#ctx;
		const width = ctx.canvas.width;
		const height = ctx.canvas.height;

		const LINE_COUNT = Math.ceil(height / LINE_SPACING) + LINE_OVERDRAW * 2;

		ctx.save();
		ctx.lineWidth = LINE_WIDTH;
		ctx.lineCap = "round";
		ctx.globalAlpha = 0.25;

		for (let i = 0; i < LINE_COUNT; i++) {
			const hue = (i * 25 + now * 0.03) % 360;
			ctx.strokeStyle = `hsl(${hue}, 75%, 50%)`;

			const baseY = (i - LINE_OVERDRAW) * LINE_SPACING;
			const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

			ctx.beginPath();

			for (let s = 0; s <= SEGMENTS; s++) {
				const t = s / SEGMENTS;
				const xBase = -100 + t * (width + 200);
				const xWobble = Math.sin(now * WOBBLE_SPEED + s + i) * WOBBLE_AMPLITUDE;
				const x = xBase + xWobble;

				const seed = (s * 31 + i * 17) % 100;
				const bend = seed / 100 < BEND_PROBABILITY ? (seed % 2 === 0 ? 1 : -1) * BEND_AMPLITUDE : 0;

				const y = baseY + wobble + bend + t * 200;
				if (s === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			}

			ctx.stroke();
		}

		ctx.restore();
	}

	#updateScale() {
		if (this.broadcasts.size === 0) {
			// Avoid division by zero.
			return;
		}

		const canvasArea = this.canvas.width * this.canvas.height;

		let broadcastArea = 0;
		for (const broadcast of this.broadcasts.values()) {
			broadcastArea += broadcast.video.targetSize.x * broadcast.video.targetSize.y;
		}

		// If we're the only broadcaster, then don't make our avatar huge.
		if (this.broadcasts.size <= 1) {
			broadcastArea *= 2;
		}

		const fillRatio = broadcastArea / canvasArea;
		const targetFill = 0.25;

		this.#scale = Math.sqrt(targetFill / fillRatio);
	}

	close() {
		this.#signals.close();

		for (const broadcast of this.broadcasts.values()) {
			broadcast.close();
		}

		for (const broadcast of this.#rip) {
			broadcast.close();
		}

		this.#rip = [];
		this.broadcasts.clear();

		this.camera.close();
		this.screen.close();
	}
}
