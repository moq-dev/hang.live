import { Connection, Moq, Publish, Watch } from "@kixelated/hang";
import { Signal, Signals, cleanup, signal } from "@kixelated/signals";
import { Broadcast, BroadcastSource } from "./broadcast";
import { Bounds, Vector } from "./geometry";

const PADDING = 64;

export type RoomProps = {
	name?: string;
	visible?: boolean;
	volume?: number;
	muted?: boolean;
};

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection;

	name: Signal<string | undefined>;

	// All of the broadcasts keyed by their path.
	// We use the insertion order to determine the z-index.
	#broadcasts = new Map<string, Broadcast>();

	// Remote broadcasts are stored separately so we treat them differently.
	#remotes = new Map<string, Watch.Broadcast>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: HTMLCanvasElement;
	viewport: Signal<Bounds>; // The canvas size, from -width/2 to +width/2, -height/2 to +height/2

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
	camera: Publish.Broadcast;
	screen: Publish.Broadcast;

	#signals = new Signals();

	constructor(connection: Connection, canvas: HTMLCanvasElement, props?: RoomProps) {
		this.connection = connection;
		this.canvas = canvas;
		this.muted = signal(props?.muted ?? false);
		this.visible = signal(props?.visible ?? true);
		this.volume = signal(props?.volume ?? 0.5);
		this.viewport = signal(
			new Bounds(
				Vector.create(-canvas.width / 2, -canvas.height / 2),
				Vector.create(canvas.width / 2, canvas.height / 2),
			),
		);
		this.name = signal(props?.name);

		this.camera = new Publish.Broadcast(connection, {
			device: "camera",
			video: false,
			audio: false,
			// Always publish the camera/avatar.
			location: {
				enabled: true,
				position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				peering: true,
			},
		});

		this.screen = new Publish.Broadcast(connection, {
			device: "screen",
			enabled: false,
			path: "me/screen.hang",
			location: {
				enabled: true,
				position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				peering: true,
			},
		});

		this.#signals.effect(() => {
			const name = this.name.get();
			if (!name) return;

			this.camera.enabled.set(true);
			cleanup(() => this.camera.enabled.set(false));

			this.camera.path.set(`${name}.hang`);
		});

		this.#signals.effect(() => {
			const name = this.name.get();
			if (!name) return;

			const active = !!this.screen.video.media.get() || !!this.screen.audio.media.get();
			if (!active) return;

			this.screen.path.set(`${name}.hang/screen`);

			this.screen.enabled.set(true);
			cleanup(() => this.screen.enabled.set(false));
		});

		const resize = () => {
			this.canvas.width = window.devicePixelRatio * window.innerWidth;
			this.canvas.height = window.devicePixelRatio * window.innerHeight;
			this.viewport.set(
				new Bounds(
					Vector.create(-this.canvas.width / 2, -this.canvas.height / 2),
					Vector.create(this.canvas.width / 2, this.canvas.height / 2),
				),
			);
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

		this.#broadcastStart(this.camera.path.peek(), {
			audio: this.camera.audio,
			video: this.camera.video,
			enabled: this.camera.enabled,
			location: {
				get: () => this.camera.location.position.get(),
				set: (position) => this.camera.location.position.set(position),
				locked: () => false, // TODO make a UI element for this?
			},
			close: () => this.camera.close(),
		});

		this.#broadcastStart(this.screen.path.peek(), {
			audio: this.screen.audio,
			video: this.screen.video,
			enabled: this.screen.enabled,
			location: {
				get: () => this.screen.location.position.get(),
				set: (position) => this.screen.location.position.set(position),
				locked: () => false, // TODO make a UI element for this?
			},
			close: () => this.screen.close(),
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
			return Vector.create(e.clientX - rect.left, e.clientY - rect.top)
				.mult(window.devicePixelRatio)
				.sub(Vector.create(this.canvas.width / 2, this.canvas.height / 2));
		};

		this.canvas.addEventListener("mousedown", (e) => {
			const mouse = mousePosition(e);

			const at = this.#broadcastAt(mouse);
			this.#dragging = at?.broadcast;
			if (!at) return;

			// Reinsert to update the z-index.
			this.#broadcasts.delete(at.name);
			this.#broadcasts.set(at.name, at.broadcast);

			if (at.broadcast.source.location.locked?.()) {
				this.canvas.style.cursor = "not-allowed";
			} else {
				this.canvas.style.cursor = "grabbing";
			}
		});

		this.canvas.addEventListener("mousemove", (e) => {
			const mouse = mousePosition(e);

			if (this.#dragging) {
				this.#dragging.source.location.set({
					x: mouse.x / this.canvas.width,
					y: mouse.y / this.canvas.height,
				});
			} else {
				const at = this.#broadcastAt(mouse);
				if (at) {
					if (!at.broadcast.source.location.locked?.()) {
						this.#hovering = at.broadcast;
						this.canvas.style.cursor = "grab";
					}
				} else {
					this.#hovering = undefined;
					this.canvas.style.cursor = "default";
				}
			}
		});

		this.canvas.addEventListener("mouseup", () => {
			if (this.#dragging) {
				this.#dragging = undefined;
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
			}
		});

		this.canvas.addEventListener("mouseleave", () => {
			if (this.#dragging) {
				this.#dragging = undefined;
				this.#hovering = undefined;
				this.canvas.style.cursor = "default";
			}
		});

		this.canvas.addEventListener(
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

				if (broadcast.source.location.locked?.()) {
					this.canvas.style.cursor = "not-allowed";
					return;
				}

				const scale = e.deltaY * 0.001;
				if (scale < 0) {
					this.canvas.style.cursor = "zoom-out";
				} else if (scale > 0) {
					this.canvas.style.cursor = "zoom-in";
				}

				const location = broadcast.source.location.get();
				broadcast.source.location.set({
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

			if (update.path === this.camera.path.peek() || update.path === this.screen.path.peek()) {
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
				});

				// TODO call `close` on these when the broadcast is closed.
				const cameraUpdates = watch.location.peer();
				const screenUpdates = watch.location.peer();

				// Update the handle when our path changes.
				this.#signals.effect(() => {
					cameraUpdates.handle.set(this.camera.path.get());
					screenUpdates.handle.set(this.screen.path.get());
				});

				// Request the position we should use from this remote broadcast.
				this.#signals.effect(() => {
					const position = cameraUpdates.location.get();
					if (position) {
						this.camera.location.position.set(position);
					}
				});

				this.#signals.effect(() => {
					const position = screenUpdates.location.get();
					if (position) {
						this.screen.location.position.set(position);
					}
				});

				// Create a new peer handle so we can publish updates if allowed.
				// TODO close this handle when the broadcast is closed.
				const peer = this.camera.location.peer();

				this.#signals.effect(() => {
					// Make sure we're actually publishing.
					if (!this.camera.published.get()) return;

					// Only set the handle if the broadcast allows peering.
					if (!watch.location.peering.get()) return;

					peer.handle.set(update.path);
					cleanup(() => peer.handle.set(undefined));
				});

				this.#remotes.set(update.path, watch);

				this.#broadcastStart(update.path, {
					audio: watch.audio,
					video: watch.video,
					enabled: watch.enabled,
					location: {
						get: () => watch.location.current.get(),
						set: (position) => peer.producer.peek()?.update(position),
						locked: () => peer.producer.peek() === undefined,
					},
					close: () => watch.close(),
				});
			} else if (existing) {
				this.#broadcastStop(update.path);
			}
		}

		for (const broadcast of this.#remotes.values()) {
			broadcast.close();
		}

		this.#remotes.clear();
	}

	#broadcastAt(point: Vector): { name: string; broadcast: Broadcast } | undefined {
		// We need to iterate in reverse order to respect the z-index.
		// TODO: Short-circuit on the first result, but that requires a reverse iterator.
		let result: { name: string; broadcast: Broadcast } | undefined;

		for (const [name, broadcast] of this.#broadcasts) {
			if (broadcast.bounds.contains(point)) {
				result = { name, broadcast };
			}
		}

		return result;
	}

	#broadcastStart(path: string, source: BroadcastSource) {
		const broadcast = new Broadcast(source, this.viewport);
		this.#broadcasts.set(path, broadcast);
	}

	#broadcastStop(path: string) {
		const broadcast = this.#broadcasts.get(path);
		if (!broadcast) throw new Error(`Broadcast not found: ${path}`);

		// Stop downloading it.
		broadcast.source.enabled.set(false);

		// Move it from the main list to the rip list.
		this.#broadcasts.delete(path);
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
			broadcast.move();
		}

		const broadcasts = Array.from(this.#broadcasts.values());
		for (const broadcast of broadcasts) {
			broadcast.tick(now, this.#scale);
		}

		// Check for collisions.
		// We might need to optimize this with a quadtree or something.
		for (let i = 0; i < broadcasts.length; i++) {
			const a = broadcasts[i];

			for (let j = i + 1; j < broadcasts.length; j++) {
				const b = broadcasts[j];

				// Compute the intersection rectangle.
				const intersection = a.bounds.intersects(b.bounds);
				if (!intersection) {
					continue;
				}

				// Repel each other based on the size of the intersection.
				const strength = (2 * intersection.area()) / (a.bounds.area() + b.bounds.area());
				let force = a.bounds.middle().sub(b.bounds.middle()).mult(strength);

				if (this.#dragging !== a && this.#dragging !== b) {
					force = force.mult(10);
				}

				a.velocity = a.velocity.add(force);
				b.velocity = b.velocity.sub(force);
			}

			const top = PADDING - a.bounds.position.y - this.canvas.height / 2;
			const down = a.bounds.position.y + a.bounds.size.y - (this.canvas.height / 2 - PADDING);
			const left = PADDING - a.bounds.position.x - this.canvas.width / 2;
			const right = a.bounds.position.x + a.bounds.size.x - (this.canvas.width / 2 - PADDING);

			if (top > 0) {
				if (down > 0) {
					// Do nothing, this element is huge.
				} else {
					a.velocity.y += top;
				}
			} else if (down > 0) {
				a.velocity.y -= down;
			}

			if (left > 0) {
				if (right > 0) {
					// Do nothing, this element is huge.
				} else {
					a.velocity.x += left;
				}
			} else if (right > 0) {
				a.velocity.x -= right;
			}
		}

		// Finally, apply the velocity to the position.
		for (const broadcast of broadcasts) {
			broadcast.move();
		}

		this.#render(now);

		this.#animation = requestAnimationFrame(this.#tick.bind(this));
	}

	#render(now: DOMHighResTimeStamp) {
		const ctx = this.#ctx;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		for (const broadcast of this.#broadcasts.values()) {
			ctx.save();
			broadcast.audio.render(ctx, broadcast.bounds, broadcast.scale);
			ctx.restore();
		}

		for (const broadcast of this.#rip) {
			ctx.save();
			ctx.globalAlpha *= broadcast.online; // Fade the opacity when the broadcaster is offline.
			broadcast.video.render(now, ctx, broadcast.bounds, broadcast.scale);
			ctx.restore();
		}

		for (const broadcast of this.#broadcasts.values()) {
			if (this.#dragging !== broadcast) {
				ctx.save();
				broadcast.video.render(now, ctx, broadcast.bounds, broadcast.scale, {
					hovering: this.#hovering === broadcast,
				});
				ctx.restore();
			}
		}

		// Render the dragging broadcast last so it's on top.
		if (this.#dragging) {
			ctx.save();
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			this.#dragging.video.render(now, ctx, this.#dragging.bounds, this.#dragging.scale, { dragging: true });
			ctx.restore();
		}
	}

	#updateScale() {
		const canvasArea = this.canvas.width * this.canvas.height;

		let broadcastArea = 0;
		for (const broadcast of this.#broadcasts.values()) {
			broadcastArea += broadcast.video.targetSize.x * broadcast.video.targetSize.y;
		}

		const fillRatio = broadcastArea / canvasArea;
		const targetFill = 0.25;

		this.#scale = Math.sqrt(targetFill / fillRatio);
	}

	close() {
		this.#signals.close();

		for (const broadcast of this.#broadcasts.values()) {
			broadcast.close();
		}

		for (const broadcast of this.#rip) {
			broadcast.close();
		}

		this.#rip = [];
		this.#broadcasts.clear();

		this.camera.close();
		this.screen.close();
	}
}
