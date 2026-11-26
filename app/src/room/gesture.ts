import type { Signal } from "@moq/signals";
import { type Bounds, Vector } from "./geometry";
import type { LocationFields, Position } from "./metadata";
import * as Peers from "./peers";
import type { Deform } from "./physics";

/** A tile gestures can move: our own broadcast, a remote peer's, or a fake one. */
export type Tile = {
	bounds: Signal<Bounds>;
	/** Where the tile is headed, which is where it's drawn unless a peer places it elsewhere. */
	position: Signal<Required<Position>>;
	dragPoint: Signal<Vector>;
	zoomCenter: Signal<Vector>;
	deform: Deform;
	visible: Signal<boolean>;
	source: Local | Remote | { role: "fake" };
};

/** Our own broadcast, which publishes its placement and carries the moves we ask of peers. */
export type Local = {
	role: "publish";
	location: { window: Pick<LocationFields["window"], "position">; peers: LocationFields["peers"] };
};

/** A remote peer's broadcast, which we move by asking its peer. */
export type Remote = {
	role: "watch";
	location: { window: Pick<LocationFields["window"], "position" | "handle" | "applied"> };
};

/** One finger on the canvas, in canvas coordinates. */
export type Touch = { id: number; point: Vector };

/** Whether `tile` belongs to a peer refusing moves. */
export function locked(tile: Tile): boolean {
	return tile.source.role === "watch" && !tile.source.location.window.handle.peek();
}

/** Hands out stacking indexes, so the newest or grabbed tile draws on top. */
export class Stack {
	/** The highest index handed out or seen. */
	top = 0;

	/** Put `position` above every other tile. */
	push(position: Signal<Required<Position>>) {
		position.update((prev) => ({ ...prev, z: ++this.top }));
	}

	/** Put `position` on top unless it already is. */
	raise(position: Signal<Required<Position>>) {
		position.update((prev) => ({ ...prev, z: prev.z === this.top ? this.top : ++this.top }));
	}
}

/** What a gesture reads from the room. */
export type GestureProps<T extends Tile> = {
	/** Every tile in stacking order, bottom first. */
	ordered: Signal<T[]>;
	/** Every tile in the order it joined. */
	joined: ReadonlyMap<string, T>;
	/** The canvas size, which positions are relative to. */
	viewport: Signal<Vector>;
	stack: Stack;
};

/** The room's mouse and touch gestures: dragging, wheel and pinch zoom, and the moves they ask of peers. */
export class Gesture<T extends Tile> {
	#props: GestureProps<T>;

	#dragging?: T;
	// Where each remote tile sat before the moves we asked of it, restored if its peer locks first.
	#homes = new WeakMap<T, Position>();

	// The fingers down, by identifier.
	#touches = new Set<number>();
	// The finger spread and scale a pinch started from, absent unless the fingers started apart.
	#pinch?: { distance: number; scale: number };

	constructor(props: GestureProps<T>) {
		this.#props = props;
	}

	/** The tile a gesture is moving, if any. */
	get dragging(): T | undefined {
		return this.#dragging;
	}

	/** The topmost tile under `point`. */
	at(point: Vector): T | undefined {
		const tiles = this.#props.ordered.peek();
		for (let i = tiles.length - 1; i >= 0; i--) {
			if (tiles[i].bounds.peek().contains(point)) return tiles[i];
		}
		return undefined;
	}

	/** Press at `point`, grabbing the tile there unless it's locked, and return that tile. */
	down(point: Vector): T | undefined {
		this.#dragging = undefined;

		const tile = this.at(point);
		if (!tile || locked(tile)) return tile;

		tile.dragPoint.set(within(tile, point));
		this.#grab(tile);
		this.#props.stack.raise(tile.position);
		this.#place(tile, point);
		return tile;
	}

	/** Drag the held tile to `point`, returning false when nothing is held. */
	move(point: Vector): boolean {
		const tile = this.#dragging;
		if (!tile) return false;
		this.#follow(tile, point);
		return true;
	}

	/** Let go, publishing where the held tile landed, and return it. */
	up(): T | undefined {
		const tile = this.#dragging;
		if (!tile) return undefined;
		this.#publish(tile);
		this.#dragging = undefined;
		return tile;
	}

	/** Zoom the held tile, or else the one under `point`, by a wheel's `delta`, and return it; a locked one stays. */
	wheel(point: Vector, delta: number): T | undefined {
		let tile = this.#dragging;
		if (!tile) {
			tile = this.at(point);
			if (!tile) return undefined;
			this.#props.stack.raise(tile.position);
		}

		if (locked(tile)) return tile;

		tile.zoomCenter.set(within(tile, point));
		if (tile !== this.#dragging) this.#remember(tile);

		const scale = -delta * 0.001;
		tile.deform.zoom += scale * 5;
		tile.position.update((prev) => ({ ...prev, s: clamp(prev.s + scale) }));

		this.#publish(tile);
		return tile;
	}

	/** Start a touch gesture with every finger now down: one drags and two pinch. */
	touchStart(touches: readonly Touch[]) {
		this.#touches = new Set(touches.map((touch) => touch.id));

		if (touches.length === 1) {
			this.down(touches[0].point);
			return;
		}
		if (touches.length !== 2) return;

		const [a, b] = touches;
		const tile = this.at(middle(a.point, b.point));
		if (!tile || locked(tile)) return;

		const distance = a.point.sub(b.point).length();
		this.#pinch = distance > 0 ? { distance, scale: tile.position.peek().s } : undefined;

		// Re-grab only on a new target, so a drag that turns into a pinch keeps the tile's pre-gesture placement.
		if (this.#dragging !== tile) {
			if (this.#dragging) this.#publish(this.#dragging);
			this.#grab(tile);
		}

		this.#props.stack.raise(tile.position);
	}

	/** Follow the fingers still down, returning false when no touch gesture is active. */
	touchMove(touches: readonly Touch[]): boolean {
		if (this.#touches.size === 0) return false;

		const tile = this.#dragging;
		if (!tile) return true;

		if (touches.length === 1) {
			this.#follow(tile, touches[0].point);
		} else if (touches.length === 2) {
			const [a, b] = touches;
			const center = middle(a.point, b.point);
			tile.zoomCenter.set(within(tile, center));

			if (this.#pinch) {
				const scale = (this.#pinch.scale * a.point.sub(b.point).length()) / this.#pinch.distance;
				tile.deform.zoom += (scale - tile.position.peek().s) * 5;
				tile.position.update((prev) => ({ ...prev, s: clamp(scale) }));
			}

			this.#place(tile, center);
		}

		return true;
	}

	/** Lift the fingers `ended` with `remaining` still down, returning the tile let go once every finger lifts. */
	touchEnd(ended: readonly number[], remaining: readonly Touch[]): T | undefined {
		for (const id of ended) this.#touches.delete(id);

		const tile = this.#dragging;
		if (!tile) return undefined;

		if (this.#touches.size === 0) {
			this.#publish(tile);
			this.#end();
			return tile;
		}

		// A pinch down to one finger drags, switching to the tile under that finger if it's another one.
		if (this.#touches.size === 1 && remaining.length === 1) {
			this.#pinch = undefined;

			const under = this.at(remaining[0].point);
			if (under && under !== tile && !locked(under)) {
				this.#publish(tile);
				this.#grab(under);
			}
		}

		return undefined;
	}

	/** Abandon the touch gesture, publishing where the held tile landed, and return it. */
	touchCancel(): T | undefined {
		this.#touches.clear();

		const tile = this.#dragging;
		if (!tile) return undefined;
		this.#publish(tile);
		this.#end();
		return tile;
	}

	/**
	 * Stop moving a remote tile whose peer stopped accepting moves at `handle`, by locking or leaving, and put it
	 * back if that rejected our move. Returns whether it ended the gesture holding the tile.
	 */
	revoke(tile: T, handle: string): boolean {
		const carrier = this.#carrier();
		const pending = carrier ? Peers.drop(carrier, handle) : false;

		// A lock mid-gesture ends it, pinch included, so a later touch can't resume its baseline.
		const dragging = this.#dragging === tile;
		if (dragging) this.#end();

		// A rejected move puts the tile back where it sat before our moves, overlaid with whatever placement the
		// peer published. A departing tile is already fading away.
		if (!dragging && !pending) return dragging;
		if (!tile.visible.peek() || tile.source.role !== "watch") return dragging;
		const placed = { ...this.#homes.get(tile), ...tile.source.location.window.position.peek() };
		tile.position.update((prev) => ({ ...prev, ...placed }));
		return dragging;
	}

	/** Stop asking `peer` to move once it confirms the move we asked for. */
	settle(peer: Peers.Peer) {
		const carrier = this.#carrier();
		if (carrier) Peers.settle(carrier, peer);
	}

	#end() {
		this.#dragging = undefined;
		this.#pinch = undefined;
	}

	// Start a gesture on `tile`, remembering where it was.
	#grab(tile: T) {
		this.#dragging = tile;
		this.#remember(tile);
	}

	// Save where a remote tile sits before we ask it to move, keeping the spot from before any move still pending.
	#remember(tile: T) {
		if (tile.source.role !== "watch") return;
		const handle = tile.source.location.window.handle.peek();
		if (handle && this.#carrier()?.peek()?.[handle]) return;
		this.#homes.set(tile, { ...tile.position.peek() });
	}

	// Drag `tile` to `point`, wobbling it toward the move, without publishing yet.
	#follow(tile: T, point: Vector) {
		const delta = point.sub(tile.bounds.peek().middle());
		tile.deform.velocity = tile.deform.velocity.add(delta.mult(0.12));
		this.#place(tile, point);
	}

	// Center `tile` on `point` without publishing it.
	#place(tile: T, point: Vector) {
		const viewport = this.#props.viewport.peek();
		tile.position.update((prev) => ({ ...prev, x: point.x / viewport.x - 0.5, y: point.y / viewport.y - 0.5 }));
	}

	// Publish where `tile` sits: our own directly, and a remote one by asking its peer.
	#publish(tile: T) {
		const position = tile.position.peek();
		const source = tile.source;

		if (source.role === "publish") {
			source.location.window.position.update((old) => ({ ...old, ...position }));
			return;
		}
		if (source.role !== "watch") return;

		const window = source.location.window;
		const handle = window.handle.peek();
		if (!handle) return;

		// Remote Control only decides who may move us, so we ask even with it off.
		const moves = this.#carrier();
		if (!moves) return;

		Peers.request(moves, { handle, position: window.position.peek(), applied: window.applied.peek() }, position);
	}

	// The peer moves we ask, all through the earliest-joined local broadcast (the camera), since requests on two
	// tracks could arrive out of order and replay an older one. Stacking order changes; this doesn't.
	#carrier(): Signal<Peers.Moves> | undefined {
		for (const tile of this.#props.joined.values()) {
			if (tile.source.role === "publish") return tile.source.location.peers.positions;
		}
		return undefined;
	}
}

// Where `point` falls within `tile`, from 0 to 1 on each axis.
function within(tile: Tile, point: Vector): Vector {
	const bounds = tile.bounds.peek();
	return Vector.create((point.x - bounds.position.x) / bounds.size.x, (point.y - bounds.position.y) / bounds.size.y);
}

function middle(a: Vector, b: Vector): Vector {
	return a.add(b).div(2);
}

// Keep a scale within the zoom limits.
function clamp(scale: number): number {
	return Math.max(Math.min(scale, 4), 0.25);
}
