import { Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import { Broadcast, BroadcastSource } from "./broadcast";
import type { Canvas } from "./canvas";
import { Vector } from "./geometry";
import { BorderRenderer } from "./gl/border";
import { BroadcastRenderer } from "./gl/broadcast";
import { OutlineRenderer } from "./gl/outline";
import type { Sound } from "./sound";

export type SpaceProps = {
	profile?: boolean;
};

export class Space {
	// All of the broadcasts stored in z-index order.
	ordered = new Signal<Broadcast[]>([]);

	// A lookup of broadcasts by path.
	lookup = new Map<string, Broadcast>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: Canvas;
	sound: Sound;
	profile: boolean;

	#hovering: Broadcast | undefined = undefined;
	#dragging?: Broadcast;

	#scale = new Signal<number>(1.0);

	#maxZ = 0;

	// WebGL renderers
	#borderRenderer: BorderRenderer;
	#outlineRenderer: OutlineRenderer;
	#broadcastRenderer: BroadcastRenderer;

	// Touch handling for mobile
	#touches = new Map<number, { x: number; y: number }>();
	#pinchStartDistance = 0;
	#pinchStartScale = 1;

	#signals = new Effect();

	constructor(canvas: Canvas, sound: Sound, props?: SpaceProps) {
		this.canvas = canvas;
		this.sound = sound;
		this.profile = props?.profile ?? false;

		// Initialize WebGL renderers
		this.#borderRenderer = new BorderRenderer(canvas);
		this.#outlineRenderer = new OutlineRenderer(canvas);
		this.#broadcastRenderer = new BroadcastRenderer(canvas);

		// Use the new eventListener helper that automatically handles cleanup
		this.#signals.event(canvas.element, "mousedown", this.#onMouseDown.bind(this));
		this.#signals.event(canvas.element, "mousemove", this.#onMouseMove.bind(this));
		this.#signals.event(canvas.element, "mouseup", this.#onMouseUp.bind(this));
		this.#signals.event(canvas.element, "mouseleave", this.#onMouseLeave.bind(this));
		this.#signals.event(canvas.element, "wheel", this.#onMouseWheel.bind(this), { passive: false });

		this.#signals.event(canvas.element, "touchstart", this.#onTouchStart.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchmove", this.#onTouchMove.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchend", this.#onTouchEnd.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchcancel", this.#onTouchCancel.bind(this), { passive: false });

		this.#signals.effect(this.#runScale.bind(this));

		// Register tick and render methods separately
		this.canvas.onRender = this.#render.bind(this);
		this.#signals.cleanup(() => {
			this.canvas.onRender = undefined;
		});

		// Run tick separately from render at 60fps
		this.#signals.effect((effect) => {
			const interval = setInterval(() => this.#tickAll(), 1000 / 60);
			effect.cleanup(() => clearInterval(interval));
		});
	}

	#onMouseDown(e: MouseEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);
		const viewport = this.canvas.viewport.peek();

		// Try enabling sound if we clicked the canvas.
		this.sound.enabled.update(() => true);
		this.#dragging = undefined;

		const broadcast = this.#at(mouse);
		if (!broadcast) return;

		if (broadcast.locked()) {
			document.body.style.cursor = "not-allowed";
			return;
		}

		// Bump the z-index unless we're already at the top.
		broadcast.position.update((prev) => ({
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
			this.#publishPosition(this.#dragging);

			this.#dragging = undefined;
			if (this.#hovering) {
				this.#hovering.name.setHovering(false);
				this.#hovering = undefined;
			}
			document.body.style.cursor = "default";
		}
	}

	#onMouseMove(e: MouseEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);
		const viewport = this.canvas.viewport.peek();

		if (this.#dragging) {
			// Update the position but don't publish it yet.
			this.#dragging.position.mutate((position) => {
				position.x = mouse.x / viewport.x - 0.5;
				position.y = mouse.y / viewport.y - 0.5;
			});
			return;
		}

		const broadcast = this.#at(mouse);
		if (broadcast) {
			if (this.#hovering !== broadcast) {
				if (this.#hovering) {
					this.#hovering.name.setHovering(false);
				}
				this.#hovering = broadcast;
				this.#hovering.name.setHovering(true);
			}

			if (!broadcast.locked()) {
				document.body.style.cursor = "grab";
			}
		} else {
			if (this.#hovering) {
				this.#hovering.name.setHovering(false);
				this.#hovering = undefined;
			}
			document.body.style.cursor = "default";
		}
	}

	#onMouseLeave() {
		if (this.#dragging) {
			this.#publishPosition(this.#dragging);

			this.#dragging = undefined;
			if (this.#hovering) {
				this.#hovering.name.setHovering(false);
				this.#hovering = undefined;
			}
			document.body.style.cursor = "default";
		}
	}

	#onMouseWheel(e: WheelEvent) {
		let broadcast = this.#dragging;
		if (!broadcast) {
			const mouse = this.canvas.relative(e.clientX, e.clientY);

			broadcast = this.#at(mouse);
			if (!broadcast) {
				// Not over a broadcast, so don't do anything.
				// TODO prevent default when not on the demo.
				return;
			}

			if (this.#hovering !== broadcast) {
				if (this.#hovering) {
					this.#hovering.name.setHovering(false);
				}
				this.#hovering = broadcast;
				this.#hovering.name.setHovering(true);
			}

			// Bump the z-index unless we're already at the top.
			broadcast.position.update((prev) => ({
				...prev,
				z: prev.z === this.#maxZ ? this.#maxZ : ++this.#maxZ,
			}));
		}

		e.preventDefault();

		if (broadcast.locked()) {
			document.body.style.cursor = "not-allowed";
			return;
		}

		const scale = -e.deltaY * 0.001;
		if (scale < 0) {
			document.body.style.cursor = "zoom-out";
		} else if (scale > 0) {
			document.body.style.cursor = "zoom-in";
		}

		// Update the scale, publishing it.
		broadcast.position.update((prev) => ({
			...prev,
			s: Math.max(Math.min((prev.s ?? 1) + scale, 4), 0.25),
		}));

		this.#publishPosition(broadcast);
	}

	#onTouchStart(e: TouchEvent) {
		// Store all active touches
		this.#touches.clear();
		for (const touch of e.touches) {
			this.#touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
		}

		if (this.#touches.size === 0) {
			return;
		}

		e.preventDefault();

		// Single touch - start dragging
		if (this.#touches.size === 1) {
			const touch = e.touches[0];
			const mouse = this.canvas.relative(touch.clientX, touch.clientY);

			this.#dragging = undefined;

			const broadcast = this.#at(mouse);
			if (!broadcast) return;

			if (broadcast.locked()) return;

			const viewport = this.canvas.viewport.peek();

			// Bump the z-index unless we're already at the top.
			broadcast.position.update((prev) => ({
				...prev,
				x: mouse.x / viewport.x - 0.5,
				y: mouse.y / viewport.y - 0.5,
				z: prev.z === this.#maxZ ? this.#maxZ : ++this.#maxZ,
			}));

			this.#dragging = broadcast;
		}
		// Two touches - start pinch zoom
		else if (this.#touches.size === 2) {
			const touches = Array.from(e.touches);
			const touch1 = touches[0];
			const touch2 = touches[1];

			// Calculate the center point between the two touches
			const centerX = (touch1.clientX + touch2.clientX) / 2;
			const centerY = (touch1.clientY + touch2.clientY) / 2;
			const center = this.canvas.relative(centerX, centerY);

			// Find the broadcast at the center point
			const broadcast = this.#at(center);
			if (!broadcast) return;

			if (broadcast.locked()) return;

			// Store the initial distance for pinch zoom
			const dx = touch2.clientX - touch1.clientX;
			const dy = touch2.clientY - touch1.clientY;
			this.#pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
			this.#pinchStartScale = broadcast.position.peek().s ?? 1;

			// Set as dragging to track which broadcast we're zooming
			this.#dragging = broadcast;

			// Bump the z-index
			broadcast.position.update((prev) => ({
				...prev,
				z: prev.z === this.#maxZ ? this.#maxZ : ++this.#maxZ,
			}));
		}
	}

	#onTouchMove(e: TouchEvent) {
		if (this.#touches.size === 0) return;

		// Update touch positions
		for (const touch of e.touches) {
			if (this.#touches.has(touch.identifier)) {
				this.#touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
			}
		}

		e.preventDefault();

		// Single touch - drag
		if (e.touches.length === 1 && this.#dragging) {
			const touch = e.touches[0];
			const mouse = this.canvas.relative(touch.clientX, touch.clientY);
			const viewport = this.canvas.viewport.peek();

			// Update the position but don't publish it yet.
			this.#dragging.position.update((prev) => ({
				...prev,
				x: mouse.x / viewport.x - 0.5,
				y: mouse.y / viewport.y - 0.5,
			}));
		}
		// Two touches - pinch zoom
		else if (e.touches.length === 2 && this.#dragging) {
			const touches = Array.from(e.touches);
			const touch1 = touches[0];
			const touch2 = touches[1];

			// Calculate current distance
			const dx = touch2.clientX - touch1.clientX;
			const dy = touch2.clientY - touch1.clientY;
			const currentDistance = Math.sqrt(dx * dx + dy * dy);

			// Calculate scale factor
			if (this.#pinchStartDistance > 0) {
				const scaleFactor = currentDistance / this.#pinchStartDistance;
				const newScale = this.#pinchStartScale * scaleFactor;

				// Update the scale
				this.#dragging.position.update((prev) => ({
					...prev,
					s: Math.max(Math.min(newScale, 4), 0.25),
				}));
			}

			// Also update position to the center of the pinch
			const centerX = (touch1.clientX + touch2.clientX) / 2;
			const centerY = (touch1.clientY + touch2.clientY) / 2;
			const center = this.canvas.relative(centerX, centerY);
			const viewport = this.canvas.viewport.peek();

			this.#dragging.position.update((prev) => ({
				...prev,
				x: center.x / viewport.x - 0.5,
				y: center.y / viewport.y - 0.5,
			}));
		}
	}

	#onTouchEnd(e: TouchEvent) {
		// Remove ended touches
		for (const touch of e.changedTouches) {
			this.#touches.delete(touch.identifier);
		}

		// If all touches ended, publish the final position
		if (this.#touches.size === 0 && this.#dragging) {
			this.#publishPosition(this.#dragging);
			this.#dragging = undefined;
			if (this.#hovering) {
				this.#hovering.name.setHovering(false);
				this.#hovering = undefined;
			}
			this.#pinchStartDistance = 0;
			this.#pinchStartScale = 1;
		}
		// If we go from 2 touches to 1, switch from pinch to drag
		else if (this.#touches.size === 1 && e.touches.length === 1) {
			// Reset pinch state
			this.#pinchStartDistance = 0;
			this.#pinchStartScale = 1;

			// Check if we should start dragging a different broadcast
			const touch = e.touches[0];
			const mouse = this.canvas.relative(touch.clientX, touch.clientY);
			const broadcast = this.#at(mouse);

			if (broadcast && !broadcast.locked()) {
				if (this.#dragging && this.#dragging !== broadcast) {
					// Publish the old broadcast's position
					this.#publishPosition(this.#dragging);
				}
				this.#dragging = broadcast;
			}
		}

		if (e.touches.length === 0) {
			e.preventDefault();
		}
	}

	#onTouchCancel(e: TouchEvent) {
		// Clear all touches and reset state
		this.#touches.clear();

		if (this.#dragging) {
			this.#publishPosition(this.#dragging);
			this.#dragging = undefined;
			if (this.#hovering) {
				this.#hovering.name.setHovering(false);
				this.#hovering = undefined;
			}
			this.#pinchStartDistance = 0;
			this.#pinchStartScale = 1;
		}

		e.preventDefault();
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

	add(id: string, source: BroadcastSource): Broadcast {
		const broadcast = new Broadcast({ source, canvas: this.canvas, sound: this.sound, scale: this.#scale });

		// Put new broadcasts on top of the stack.
		// NOTE: This is not sent over the network.
		broadcast.position.update((prev) => ({
			...prev,
			z: ++this.#maxZ,
		}));

		// Set profile mode for the name display
		broadcast.name.setProfile(this.profile);

		if (this.lookup.has(id)) {
			throw new Error(`broadcast already exists: ${id}`);
		}

		this.lookup.set(id, broadcast);

		// Insert the broadcast into the room based on it's z-index.
		this.ordered.update((prev) => [...prev, broadcast]);

		broadcast.visible.set(true);

		// Resort the broadcasts when the z-index changes.
		broadcast.signals.effect((effect) => {
			// Get our z-index so we resort when it changes.
			const z = effect.get(broadcast.position).z;
			if (z > this.#maxZ) {
				// Save the higher z-index so we can use it for new broadcasts.
				this.#maxZ = z;
			}

			this.ordered.update((prev) =>
				prev.sort(
					// Peek at the other broadcasts' z-index to avoid re-sorting every time.
					(a, b) => a.position.peek().z - b.position.peek().z,
				),
			);
		});

		// When the media source changes, bump the z-index to the highest known value.
		broadcast.signals.effect((effect) => {
			if (broadcast.source instanceof Publish.Broadcast) {
				if (!effect.get(broadcast.source.enabled)) return;
				if (!effect.get(broadcast.source.video.source) && !effect.get(broadcast.source.audio.source)) return;

				broadcast.position.update((prev) => ({
					...prev,
					z: ++this.#maxZ,
				}));
			}
		});

		broadcast.signals.effect((effect) => {
			const message = effect.get(broadcast.source.chat.message.latest);
			if (!message) return;

			broadcast.position.update((prev) => ({
				...prev,
				z: ++this.#maxZ,
			}));
		});

		broadcast.signals.effect((effect) => {
			if (!effect.get(broadcast.visible)) return;

			const name = effect.get(broadcast.source.user.name);
			if (!name) return;

			if (name.endsWith("(screen)")) return;

			this.sound.tts.joined(name);
		});

		broadcast.signals.effect((effect) => {
			if (effect.get(broadcast.visible)) return;

			const name = effect.get(broadcast.source.user.name);
			if (!name) return;

			if (name.endsWith("(screen)")) return;

			this.sound.tts.left(name);
		});

		return broadcast;
	}

	async remove(path: string): Promise<BroadcastSource> {
		const broadcast = this.lookup.get(path);
		if (!broadcast) {
			throw new Error(`broadcast not found: ${path}`);
		}

		broadcast.setOnline(false);

		this.lookup.delete(path);

		// Move it from the main list to the rip list.
		this.ordered.update((prev) => prev.filter((b) => b !== broadcast));
		this.#rip.push(broadcast);

		// Slowly fade out the offline broadcast.
		broadcast.visible.set(false);

		// Wait for the fade to complete, roughly.
		await new Promise((resolve) => setTimeout(resolve, 1000));

		this.#rip.splice(this.#rip.indexOf(broadcast), 1);
		broadcast.close();

		return broadcast.source;
	}

	clear(): Broadcast[] {
		const all = this.ordered.peek();
		this.ordered.set([]);
		this.lookup.clear();
		return all;
	}

	// Tick physics separately from rendering
	#tickAll() {
		const now = performance.now();

		for (const broadcast of this.#rip) {
			broadcast.tick(now);
		}

		const broadcasts = this.ordered.peek();

		for (const broadcast of broadcasts) {
			broadcast.tick(now);
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
	}

	// Render using WebGL
	#render(now: DOMHighResTimeStamp) {
		const broadcasts = this.ordered.peek();

		// Render in order: black borders (back) -> audio viz (middle) -> videos (front)
		// This way audio viz shows through overlapping black borders

		// 1. Render black borders (furthest back)
		for (const broadcast of this.#rip) {
			this.#borderRenderer.render(broadcast, this.canvas.camera, this.#maxZ);
		}
		for (const broadcast of broadcasts) {
			this.#borderRenderer.render(broadcast, this.canvas.camera, this.#maxZ);
		}

		// 2. Render audio visualizations (middle layer)
		for (const broadcast of this.#rip) {
			this.#outlineRenderer.render(broadcast, this.canvas.camera, this.#maxZ, now);
		}
		for (const broadcast of broadcasts) {
			this.#outlineRenderer.render(broadcast, this.canvas.camera, this.#maxZ, now);
		}

		// 3. Render video content (front layer)
		for (const broadcast of this.#rip) {
			this.#broadcastRenderer.render(broadcast, this.canvas.camera, this.#maxZ);
		}

		// Render all broadcasts (except dragging)
		for (const broadcast of broadcasts) {
			if (this.#dragging !== broadcast) {
				this.#broadcastRenderer.render(broadcast, this.canvas.camera, this.#maxZ, {
					hovering: this.#hovering === broadcast || this.profile,
				});
			}
		}

		// Render the dragging broadcast last so it's always on top
		if (this.#dragging) {
			this.#broadcastRenderer.render(this.#dragging, this.canvas.camera, this.#maxZ, {
				dragging: true,
			});
		}
	}

	#runScale(effect: Effect) {
		const broadcasts = effect.get(this.ordered);
		if (broadcasts.length === 0) {
			// Avoid division by zero.
			return;
		}

		const canvasArea = effect.get(this.canvas.viewport).area();

		let broadcastArea = 0;
		for (const broadcast of broadcasts) {
			const size = effect.get(broadcast.video.targetSize);
			broadcastArea += size.x * size.y;
		}

		const fillRatio = broadcastArea / canvasArea;
		const targetFill = 0.25;

		const scale = Math.min(Math.sqrt(targetFill / fillRatio), 1);
		this.#scale.set(scale);
	}

	close() {
		this.#borderRenderer.close();
		this.#outlineRenderer.close();
		this.#broadcastRenderer.close();

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

	// Publish the current position to the network.
	#publishPosition(broadcast: Broadcast) {
		const position = broadcast.position.peek();

		if (broadcast.source instanceof Publish.Broadcast) {
			broadcast.source.location.window.position.update((old) => ({ ...old, ...position }));
			return;
		}

		if (broadcast.source instanceof Watch.Broadcast) {
			const handle = broadcast.source.location.window.handle.peek();
			if (!handle) return;

			// TODO optimize this by storing local handles separately.
			for (const broadcast of this.ordered.peek()) {
				if (broadcast.source instanceof Publish.Broadcast && broadcast.source.location.peers.enabled.peek()) {
					broadcast.source.location.peers.positions.set({ [handle]: position });
					return;
				}
			}

			console.warn("no local peers found");
		}
	}
}
