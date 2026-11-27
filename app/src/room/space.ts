import * as Clock from "@moq/clock";
import { Effect, Signal } from "@moq/signals";
import { Broadcast, type BroadcastSource } from "./broadcast";
import type { Canvas } from "./canvas";
import { Cursor } from "./cursor";
import * as Gesture from "./gesture";
import { AudioRenderer } from "./gl/audio";
import { BorderRenderer } from "./gl/border";
import { BroadcastRenderer } from "./gl/broadcast";
import type { GLContext } from "./gl/context";
import type { HangLocalSource } from "./local";
import { LIVE_EXPIRY, type Point, type Position } from "./metadata";
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
	// Where the mouse is over the canvas, in room coordinates, streamed to peers each frame.
	#pointer?: Point;

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
		this.#signals.event(canvas.element, "mouseleave", this.#onMouseLeave.bind(this));
		this.#signals.event(canvas.element, "wheel", this.#onMouseWheel.bind(this), { passive: false });

		this.#signals.event(canvas.element, "touchstart", this.#onTouchStart.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchmove", this.#onTouchMove.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchend", this.#onTouchEnd.bind(this), { passive: false });
		this.#signals.event(canvas.element, "touchcancel", this.#onTouchCancel.bind(this), { passive: false });

		this.#signals.run(this.#runScale.bind(this));

		// Physics steps with each rendered frame, so it pauses whenever the canvas is hidden.
		this.#signals.set(this.canvas.scene, this.#frame.bind(this));

		// Frames stop while hidden or without a GL context, so end the drag and drop the pointer instead of
		// streaming stale ones that no frame would clear.
		this.#signals.run((effect) => {
			if (effect.get(this.canvas.visible) && effect.get(this.canvas.context)) return;
			this.#pointer = undefined;
			// Ends a mouse drag as well as a touch one, publishing where the tile landed.
			this.#release(this.#gesture.touchCancel());
			this.#stream();
		});
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
		this.#release(this.#gesture.up());
	}

	#onMouseLeave() {
		this.#pointer = undefined;
		this.#onMouseRelease();
	}

	// Clear the hover and grab cursor once a gesture lets go of `tile`, if it held one.
	#release(tile: Broadcast | undefined) {
		if (!tile) return;
		this.#hover(undefined);
		document.body.style.cursor = "default";
	}

	#onMouseMove(e: MouseEvent) {
		const mouse = this.canvas.relative(e.clientX, e.clientY);
		const viewport = this.canvas.viewport.peek();
		// Before the first resize the viewport is empty, and dividing by it would publish NaN.
		this.#pointer =
			viewport.x > 0 && viewport.y > 0
				? { x: mouse.x / viewport.x - 0.5, y: mouse.y / viewport.y - 0.5 }
				: undefined;
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
		this.#release(this.#gesture.touchEnd(ended, this.#fingers(e.touches)));
		if (e.touches.length === 0) e.preventDefault();
	}

	#onTouchCancel(e: TouchEvent) {
		this.#release(this.#gesture.touchCancel());
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

	/** Add a tile for `source` under `id`, which must be new. */
	add<T extends BroadcastSource>(id: string, source: T): Broadcast<T> {
		const broadcast = new Broadcast({ source, canvas: this.canvas, sound: this.sound, scale: this.#scale });

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

		this.#runHeld(broadcast);

		if (source.role === "watch") {
			const cursor = new Cursor(broadcast, source);
			broadcast.signals.cleanup(() => cursor.close());

			// A peer dragging its own window streams where it is.
			broadcast.signals.run((effect) => {
				hold(effect, broadcast, broadcast, effect.get(source.location.live.window));
			});

			// A peer dragging someone's window streams it by the handle that window publishes. Resolved
			// reactively, since a viewer joining mid-drag may learn the window or its handle after the first
			// datagram, and a window that locks or rotates its handle mid-drag stops following. Only a new
			// target reruns the hold, so reordering tiles doesn't replay a stale position.
			const dragged = broadcast.signals.computed((effect) => effect.get(source.location.live.peer)?.handle);
			const target = broadcast.signals.computed((effect) => {
				const handle = effect.get(dragged);
				return handle ? this.#addressed(handle, effect) : undefined;
			});
			broadcast.signals.run((effect) => {
				const window = effect.get(target);
				if (!window) return;
				const handle = effect.get(dragged);
				effect.run((effect) => {
					// A datagram that switches windows can reach this run before the new target does.
					const peer = effect.get(source.location.live.peer);
					hold(effect, window, broadcast, peer && peer.handle === handle ? peer.position : undefined);
				});
			});

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
		if (broadcast.source.role !== "publish") return;
		const location = broadcast.source.location;
		location.peers.positions.set(undefined);
		location.live.cursor.set(undefined);
		location.live.window.set(undefined);
		location.live.peer.set(undefined);
	}

	// Follow a peer's drag of this window while it streams, then fall back to the durable snapshot.
	#runHeld(broadcast: Broadcast) {
		// Where the window sat before a peer's drag held it.
		let home: Position | undefined;
		broadcast.signals.run((effect) => {
			// The latest sender's hold wins while several drag at once.
			const live = [...effect.get(broadcast.holds).values()].at(-1);
			if (live) {
				home ??= { ...broadcast.position.peek() };
				if (this.#gesture.dragging !== broadcast) broadcast.position.update((prev) => ({ ...prev, ...live }));
				return;
			}
			if (!home) return;
			const from = home;

			// The drag's end can beat the snapshot it settles into, and a refused move never lands in one,
			// so wait a moment before putting the window back where the snapshot says, or where it sat
			// before the drag when it never published a position.
			effect.timer(() => {
				home = undefined;
				if (this.#gesture.dragging === broadcast) return;
				const placed = broadcast.source.location.window.position.peek();
				// The stacking order stays local.
				broadcast.position.update((prev) => ({
					...prev,
					x: placed?.x ?? from.x ?? prev.x,
					y: placed?.y ?? from.y ?? prev.y,
					s: placed?.s ?? from.s ?? prev.s,
				}));
			}, LIVE_EXPIRY);
		});
	}

	// The window publishing `handle`, which peers may move.
	#addressed(handle: string, effect: Effect): Broadcast | undefined {
		for (const broadcast of effect.get(this.ordered)) {
			if (handleOf(broadcast, effect) === handle) return broadcast;
		}
		return undefined;
	}

	// Stream the pointer and the dragged window to peers over datagrams, once per frame at most.
	#stream() {
		const dragging = this.#gesture.dragging;
		const position = dragging?.position.peek();

		// The pointer and peer drags ride the camera, like the moves in #carrier.
		let carrier: HangLocalSource | undefined;
		for (const broadcast of this.lookup.values()) {
			const source = broadcast.source;
			if (source.role !== "publish") continue;
			carrier ??= source;
			source.location.live.window.set(dragging === broadcast ? position : undefined);
		}
		if (!carrier) return;

		carrier.location.live.cursor.set(this.#pointer);
		const handle = dragging?.source.role === "watch" ? dragging.source.location.window.handle.peek() : undefined;
		carrier.location.live.peer.set(handle && position ? { handle, position } : undefined);
	}

	// Step the physics for the time since the last frame, then draw it.
	#frame(now: DOMHighResTimeStamp) {
		this.#stream();

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

// The handle a window publishes for peers to address its moves, if it takes any.
function handleOf(broadcast: Broadcast, effect: Effect): string | undefined {
	const source = broadcast.source;
	if (source.role === "watch") return effect.get(source.location.window.handle);
	if (source.role === "publish")
		return effect.get(source.location.window.movable) ? effect.get(source.location.window.handle) : undefined;
	return undefined;
}

// Hold `target` at `position` for this run on behalf of `sender`, leaving other senders' holds alone.
function hold(effect: Effect, target: Broadcast, sender: Broadcast, position: Position | undefined) {
	if (!position) return;
	// Re-added last, so the sender that moved most recently shows.
	target.holds.update((prev) => {
		const next = new Map(prev);
		next.delete(sender);
		return next.set(sender, position);
	});
	effect.cleanup(() =>
		target.holds.update((prev) => {
			const next = new Map(prev);
			next.delete(sender);
			return next;
		}),
	);
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
