import { Publish } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { Vector } from "./geometry";
import type { Sound } from "./sound";

export class Space {
	// All of the broadcasts stored in z-index order.
	ordered = new Signal<Broadcast[]>([]);

	// A lookup of broadcasts by name.
	lookup = new Map<string, Broadcast>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: Canvas;
	sound?: Sound;

	#hovering: Broadcast | undefined = undefined;
	#dragging?: Broadcast;
	#scale = 1.0;

	#maxZ = 0;

	#signals = new Effect();

	constructor(canvas: Canvas, sound?: Sound) {
		this.canvas = canvas;
		this.sound = sound;

		// Use the new eventListener helper that automatically handles cleanup
		this.#signals.eventListener(window, "mousedown", this.#onMouseDown.bind(this));
		this.#signals.eventListener(window, "mousemove", this.#onMouseMove.bind(this));
		this.#signals.eventListener(window, "mouseup", this.#onMouseUp.bind(this));
		this.#signals.eventListener(window, "mouseleave", this.#onMouseLeave.bind(this));
		this.#signals.eventListener(window, "wheel", this.#onMouseWheel.bind(this), { passive: false });

		// This is a bit of a hack, but register our render method.
		this.canvas.onRender = this.#tick.bind(this);
		this.#signals.cleanup(() => {
			this.canvas.onRender = undefined;
		});
	}

	#onMouseDown(e: MouseEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);

		this.#dragging = undefined;

		const broadcast = this.#at(mouse);
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
	}

	#onMouseUp(_: MouseEvent) {
		if (this.#dragging) {
			this.#dragging.publishPosition();

			this.#dragging = undefined;
			this.#hovering = undefined;
			document.body.style.cursor = "default";
		}
	}

	#onMouseMove(e: MouseEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);
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

		const broadcast = this.#at(mouse);
		if (broadcast) {
			this.#hovering = broadcast;

			if (!broadcast.locked()) {
				document.body.style.cursor = "grab";
			}
		} else {
			this.#hovering = undefined;
			document.body.style.cursor = "default";
		}
	}

	#onMouseLeave() {
		if (this.#dragging) {
			this.#dragging.publishPosition();

			this.#dragging = undefined;
			this.#hovering = undefined;
			document.body.style.cursor = "default";
		}
	}

	#onMouseWheel(e: WheelEvent) {
		// Check if the mouse is actually over the canvas element before preventing default.
		const rect = this.canvas.element.getBoundingClientRect();
		const isOverCanvas =
			e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

		if (!isOverCanvas) return;

		e.preventDefault();

		let broadcast = this.#dragging;
		if (!broadcast) {
			const mouse = this.canvas.relative(e.clientX, e.clientY);

			broadcast = this.#at(mouse);
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
	}

	#at(point: Vector): Broadcast | undefined {
		// Loop in reverse order to respect the z-index.
		const broadcasts = this.ordered.peek();

		for (let i = broadcasts.length - 1; i >= 0; i--) {
			const broadcast = broadcasts[i];
			if (broadcast.bounds.peek().contains(point)) {
				return broadcast;
			}
		}

		return undefined;
	}

	add(id: string, broadcast: Broadcast) {
		// Put new broadcasts on top of the stack.
		// NOTE: This is not sent over the network.
		broadcast.targetPosition.set((prev) => ({
			...prev,
			z: ++this.#maxZ,
		}));

		if (this.lookup.has(id)) {
			throw new Error(`broadcast already exists: ${id}`);
		}

		this.lookup.set(id, broadcast);

		// Insert the broadcast into the room based on it's z-index.
		this.ordered.set((prev) => [...prev, broadcast]);

		broadcast.online.set(true);

		// Resort the broadcasts when the z-index changes.
		broadcast.signals.effect((effect) => {
			// Get our z-index so we resort when it changes.
			const z = effect.get(broadcast.targetPosition).z;
			if (z > this.#maxZ) {
				// Save the higher z-index so we can use it for new broadcasts.
				this.#maxZ = z;
			}

			this.ordered.set((prev) =>
				prev.sort(
					// Peek at the other broadcasts' z-index to avoid re-sorting every time.
					(a, b) => a.targetPosition.peek().z - b.targetPosition.peek().z,
				),
			);
		});

		// When the media source changes, bump the z-index to the highest known value.
		broadcast.signals.effect((effect) => {
			if (broadcast.source instanceof Publish.Broadcast) {
				if (!effect.get(broadcast.source.enabled)) return;
				if (!effect.get(broadcast.source.video.media) && !effect.get(broadcast.source.audio.media)) return;

				broadcast.targetPosition.set((prev) => ({
					...prev,
					z: ++this.#maxZ,
				}));
			}
		});

		broadcast.signals.effect((effect) => {
			const message = effect.get(broadcast.source.chat.message);
			if (!message) return;

			broadcast.targetPosition.set((prev) => ({
				...prev,
				z: ++this.#maxZ,
			}));
		});
	}

	remove(name: string) {
		const broadcast = this.lookup.get(name);
		if (!broadcast) {
			throw new Error(`broadcast not found: ${name}`);
		}

		this.lookup.delete(name);

		// Move it from the main list to the rip list.
		this.ordered.set((prev) => prev.filter((b) => b !== broadcast));
		this.#rip.push(broadcast);

		// Slowly fade out the offline broadcast.
		broadcast.online.set(false);

		// Wait for the fade to complete, roughly.
		setTimeout(() => {
			this.#rip.splice(this.#rip.indexOf(broadcast), 1);

			// Don't close local broadcasts, we keep them open and toggle instead.
			if (!(broadcast.source instanceof Publish.Broadcast)) {
				broadcast.close();
			}
		}, 1000);
	}

	removeAll() {
		for (const broadcast of this.ordered.peek()) {
			if (!(broadcast.source instanceof Publish.Broadcast)) {
				broadcast.close();
			}
		}

		this.ordered.set([]);
		this.lookup.clear();
	}

	#tick(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
		try {
			this.#tickScale();

			for (const broadcast of this.#rip) {
				broadcast.tick(this.#scale);
			}

			const broadcasts = this.ordered.peek();

			for (const broadcast of broadcasts) {
				broadcast.tick(this.#scale);
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

	#render(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
		// Render the audio click prompt if audio is suspended
		if (this.sound?.suspended.peek()) {
			this.#renderAudioPrompt(ctx);
		}

		const broadcasts = this.ordered.peek();
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
		for (const broadcast of broadcasts) {
			if (broadcast.source instanceof Publish.Broadcast) {
				broadcast.renderLocator(now, ctx);
			}
		}
	}

	#renderAudioPrompt(ctx: CanvasRenderingContext2D) {
		ctx.save();

		const width = ctx.canvas.width;
		const scale = window.devicePixelRatio;
		const padding = 30 * scale;
		const boxWidth = 400 * scale;
		const height = 80 * scale;
		const y = ctx.canvas.height - height - padding;
		const x = (width - boxWidth) / 2;
		const borderRadius = 16 * scale;

		// Rounded rectangle with thick black border
		ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
		ctx.beginPath();
		ctx.roundRect(x, y, boxWidth, height, borderRadius);
		ctx.fill();

		// Thick border
		ctx.strokeStyle = "rgba(0, 0, 0, 1)";
		ctx.lineWidth = 6 * scale;
		ctx.stroke();

		// Text
		ctx.font = `${24 * scale}px sans-serif`;
		ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("🔊 Click to enable audio", width * 0.5, y + height / 2);

		ctx.restore();
	}

	#tickScale() {
		const broadcasts = this.ordered.peek();
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

		for (const broadcast of this.ordered.peek()) {
			broadcast.close();
		}

		for (const broadcast of this.#rip) {
			broadcast.close();
		}

		this.#rip = [];
		this.ordered.set([]);
		this.lookup.clear();
	}
}
