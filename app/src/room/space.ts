import * as Clock from "@moq/clock";
import { Effect, Signal } from "@moq/signals";
import { Broadcast, type BroadcastSource } from "./broadcast";
import type { Canvas } from "./canvas";
import * as Gesture from "./gesture";
import { AudioRenderer } from "./gl/audio";
import { BorderRenderer } from "./gl/border";
import { BroadcastRenderer } from "./gl/broadcast";
import type { GLContext } from "./gl/context";
import * as Physics from "./physics";
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
	#stack = new Gesture.Stack();
	#gesture: Gesture.Gesture<Broadcast>;

	#scale = new Signal<number>(1.0);

	// WebGL renderers for the live context.
	#renderers?: Renderers;

	#stepper = new Physics.Stepper();

	#signals = new Effect();

	constructor(canvas: Canvas, sound: Sound, props?: SpaceProps) {
		this.canvas = canvas;
		this.sound = sound;
		this.profile = props?.profile ?? false;
		this.#gesture = new Gesture.Gesture({
			ordered: this.ordered,
			joined: this.lookup,
			viewport: canvas.viewport,
			stack: this.#stack,
		});

		this.#signals.run(this.#runRenderers.bind(this));

		// Use the new eventListener helper that automatically handles cleanup
		this.#signals.event(canvas.element, "mousedown", this.#onMouseDown.bind(this));
		this.#signals.event(canvas.element, "mousemove", this.#onMouseMove.bind(this));
		// Releasing the button and leaving the canvas both end a drag.
		this.#signals.event(canvas.element, "mouseup", this.#onMouseRelease.bind(this));
		this.#signals.event(canvas.element, "mouseleave", this.#onMouseRelease.bind(this));
		this.#signals.event(canvas.element, "wheel", this.#onMouseWheel.bind(this), { passive: false });

		this.#signals.event(canvas.element, "touchstart", this.#onTouchStart.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchmove", this.#onTouchMove.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchend", this.#onTouchEnd.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchcancel", this.#onTouchCancel.bind(this), { passive: false });

		this.#signals.run(this.#runScale.bind(this));

		// Physics steps with each rendered frame, so it pauses whenever the canvas is hidden.
		this.#signals.set(this.canvas.scene, this.#frame.bind(this));
	}

	#runRenderers(effect: Effect) {
		const context = effect.get(this.canvas.context);
		if (!context) return;

		const renderers = new Renderers(context);
		this.#renderers = renderers;
		effect.cleanup(() => {
			this.#renderers = undefined;
			renderers.close();
		});
	}

	#onMouseDown(e: MouseEvent) {
		const broadcast = this.#gesture.down(this.canvas.relative(e.clientX, e.clientY));
		if (broadcast) document.body.style.cursor = Gesture.locked(broadcast) ? "not-allowed" : "grabbing";
	}

	#onMouseRelease() {
		if (!this.#gesture.up()) return;
		this.#hover(undefined);
		document.body.style.cursor = "default";
	}

	#onMouseMove(e: MouseEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);
		if (this.#gesture.move(mouse)) return;

		const broadcast = this.#gesture.at(mouse);
		if (broadcast) {
			this.#hover(broadcast);
			if (!Gesture.locked(broadcast)) document.body.style.cursor = "grab";
		} else {
			this.#hover(undefined);
			document.body.style.cursor = "default";
		}
	}

	#onMouseWheel(e: WheelEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);
		const dragging = this.#gesture.dragging;

		const broadcast = this.#gesture.wheel(mouse, e.deltaY);
		// Not over a broadcast, so don't do anything.
		// TODO prevent default when not on the demo.
		if (!broadcast) return;

		if (!dragging) this.#hover(broadcast);
		e.preventDefault();

		if (Gesture.locked(broadcast)) {
			document.body.style.cursor = "not-allowed";
		} else if (e.deltaY > 0) {
			document.body.style.cursor = "zoom-out";
		} else if (e.deltaY < 0) {
			document.body.style.cursor = "zoom-in";
		}
	}

	#onTouchStart(e: TouchEvent) {
		if (e.touches.length > 0) e.preventDefault();
		this.#gesture.touchStart(this.#fingers(e.touches));
	}

	#onTouchMove(e: TouchEvent) {
		if (this.#gesture.touchMove(this.#fingers(e.touches))) e.preventDefault();
	}

	#onTouchEnd(e: TouchEvent) {
		const ended = Array.from(e.changedTouches, (touch) => touch.identifier);
		if (this.#gesture.touchEnd(ended, this.#fingers(e.touches))) this.#hover(undefined);
		if (e.touches.length === 0) e.preventDefault();
	}

	#onTouchCancel(e: TouchEvent) {
		if (this.#gesture.touchCancel()) this.#hover(undefined);
		e.preventDefault();
	}

	#fingers(touches: TouchList): Gesture.Touch[] {
		return Array.from(touches, (touch) => ({
			id: touch.identifier,
			point: this.canvas.relative(touch.clientX, touch.clientY),
		}));
	}

	// Show the name of the broadcast under the pointer, if any.
	#hover(broadcast: Broadcast | undefined) {
		if (this.#hovering === broadcast) return;
		this.#hovering?.name.setHovering(false);
		this.#hovering = broadcast;
		broadcast?.name.setHovering(true);
	}

	add(id: string, source: BroadcastSource): Broadcast {
		const broadcast = new Broadcast({
			path: id,
			source,
			canvas: this.canvas,
			sound: this.sound,
			scale: this.#scale,
		});

		// Put new broadcasts on top of the stack.
		// NOTE: This is not sent over the network.
		this.#stack.push(broadcast.position);

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
		broadcast.signals.run((effect) => {
			// Get our z-index so we resort when it changes.
			const z = effect.get(broadcast.position).z;
			if (z > this.#stack.top) {
				// Save the higher z-index so we can use it for new broadcasts.
				this.#stack.top = z;
			}

			// Sorts in place, so mutate to notify.
			this.ordered.mutate((ordered) =>
				ordered.sort(
					// Peek at the other broadcasts' z-index to avoid re-sorting every time.
					(a, b) => a.position.peek().z - b.position.peek().z,
				),
			);
		});

		if (source.role === "publish") {
			// When the media source changes, bump the z-index to the highest known value.
			broadcast.signals.run((effect) => {
				if (!effect.get(source.enabled)) return;
				if (!effect.get(source.video.source) && !effect.get(source.audio.source)) return;

				this.#stack.push(broadcast.position);
			});
		}

		broadcast.signals.run((effect) => {
			const message = effect.get(broadcast.source.chat.message.latest);
			if (!message) return;

			this.#stack.push(broadcast.position);
		});

		if (source.role === "watch") {
			broadcast.signals.run((effect) => {
				const handle = effect.get(source.location.window.handle);
				if (!handle) return;

				// Stop asking a peer to move once it leaves or locks its tile.
				effect.cleanup(() => {
					if (this.#gesture.revoke(broadcast, handle)) document.body.style.cursor = "default";
				});

				effect.run((effect) => {
					this.#gesture.settle({
						handle,
						position: effect.get(source.location.window.position),
						applied: effect.get(source.location.window.applied),
					});
				});
			});
		}

		broadcast.signals.run((effect) => {
			if (!effect.get(broadcast.visible)) return;

			const name = effect.get(broadcast.source.user.name);
			if (!name) return;

			if (name.endsWith("(screen)")) return;

			void this.sound.tts.joined(name);
		});

		broadcast.signals.run((effect) => {
			if (effect.get(broadcast.visible)) return;

			const name = effect.get(broadcast.source.user.name);
			if (!name) return;

			if (name.endsWith("(screen)")) return;

			void this.sound.tts.left(name);
		});

		return broadcast;
	}

	async remove(path: string): Promise<BroadcastSource | undefined> {
		const broadcast = this.lookup.get(path);
		if (!broadcast) return undefined;

		broadcast.setOnline(false);

		this.lookup.delete(path);
		this.#leave(broadcast);

		// Move it from the main list to the rip list.
		this.ordered.update((prev) => prev.filter((b) => b !== broadcast));
		this.#rip.push(broadcast);

		// Slowly fade out the offline broadcast.
		broadcast.visible.set(false);

		// Wait for the fade to complete, roughly.
		await Clock.sleep(Clock.Duration.secs(1));

		// Space.close may have closed it already.
		const index = this.#rip.indexOf(broadcast);
		if (index < 0) return broadcast.source;

		this.#rip.splice(index, 1);
		broadcast.close();

		return broadcast.source;
	}

	clear(): Broadcast[] {
		const all = this.ordered.peek();
		for (const broadcast of all) this.#leave(broadcast);
		this.ordered.set([]);
		this.lookup.clear();
		return all;
	}

	// Forget the peer moves a departing local publisher asked for, right away, since a publisher reused
	// later (such as a new screen share) would replay them, and nothing settles them anymore.
	#leave(broadcast: Broadcast) {
		if (broadcast.source.role === "publish") broadcast.source.location.peers.positions.set(undefined);
	}

	// Step the physics for the time since the last frame, then draw it.
	#frame(now: DOMHighResTimeStamp) {
		const steps = this.#stepper.advance();
		for (let i = 0; i < steps; i++) this.#step();

		for (const broadcast of this.#rip) broadcast.tick(now);
		for (const broadcast of this.ordered.peek()) broadcast.tick(now);

		this.#render(now);
	}

	#step() {
		for (const broadcast of this.#rip) {
			broadcast.step();
		}

		const broadcasts = this.ordered.peek();

		for (const broadcast of broadcasts) {
			broadcast.step();
		}

		// Check for collisions.
		// We might need to optimize this with a quadtree or something.
		for (let i = 0; i < broadcasts.length; i++) {
			const a = broadcasts[i];

			for (let j = i + 1; j < broadcasts.length; j++) {
				const b = broadcasts[j];

				let force = Physics.repel(a.bounds.peek(), b.bounds.peek());
				if (!force) continue;

				if (this.#gesture.dragging !== a && this.#gesture.dragging !== b) {
					force = force.mult(10);
				}

				a.velocity = a.velocity.add(force);
				b.velocity = b.velocity.sub(force);
			}
		}
	}

	// Render using WebGL
	#render(now: DOMHighResTimeStamp) {
		const renderers = this.#renderers;
		if (!renderers) return;

		const broadcasts = this.ordered.peek();

		// Render in order: black borders (back) -> audio viz (middle) -> videos (front)
		// This way audio viz shows through overlapping black borders

		// 1. Render black borders (furthest back)
		for (const broadcast of this.#rip) {
			renderers.border.render(broadcast, this.canvas.camera, this.#stack.top);
		}
		for (const broadcast of broadcasts) {
			renderers.border.render(broadcast, this.canvas.camera, this.#stack.top);
		}

		// 2. Render audio visualizations (middle layer)
		for (const broadcast of this.#rip) {
			renderers.audio.render(broadcast, this.canvas.camera, this.#stack.top, now);
		}
		for (const broadcast of broadcasts) {
			renderers.audio.render(broadcast, this.canvas.camera, this.#stack.top, now);
		}

		// 3. Render video content (front layer)
		for (const broadcast of this.#rip) {
			renderers.broadcast.render(broadcast, this.canvas.camera, this.#stack.top);
		}

		// Render all broadcasts (except dragging)
		const dragging = this.#gesture.dragging;
		for (const broadcast of broadcasts) {
			if (dragging !== broadcast) {
				renderers.broadcast.render(broadcast, this.canvas.camera, this.#stack.top);
			}
		}

		// Render the dragging broadcast last so it's always on top
		if (dragging) {
			renderers.broadcast.render(dragging, this.canvas.camera, this.#stack.top, {
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
		this.#signals.close();

		for (const broadcast of this.ordered.peek()) {
			this.#leave(broadcast);
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

// The WebGL renderers for one live context.
class Renderers {
	border: BorderRenderer;
	audio: AudioRenderer;
	broadcast: BroadcastRenderer;

	constructor(context: GLContext) {
		this.border = new BorderRenderer(context);
		this.audio = new AudioRenderer(context);
		this.broadcast = new BroadcastRenderer(context);
	}

	close() {
		this.border.close();
		this.audio.close();
		this.broadcast.close();
	}
}
