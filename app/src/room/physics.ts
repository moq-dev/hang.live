import * as Clock from "@moq/clock";
import { Bounds, Vector } from "./geometry";

/** One physics step; the tuned constants assume 60 steps per second. */
export const STEP = Clock.Duration.micros(1_000_000 / 60);

// A frame longer than this many steps (a stall or a resumed tab) drops the rest instead of catching up.
const MAX_STEPS = 4;

// Drag wobble beyond this needs the subdivided mesh to bend smoothly.
const DRAG_THRESHOLD = 0.5;
// Zoom wobble beyond this needs the subdivided mesh, a lower bar than dragging.
const ZOOM_THRESHOLD = 0.1;

// Per-step decay; drag wobble lasts longer than zoom wobble.
const DRAG_DECAY = 0.8;
const ZOOM_DECAY = 0.76;
// Wobble below this snaps to rest.
const REST = 0.01;

/** Counts the fixed physics steps due each frame, so motion keeps its speed at any frame rate. */
export class Stepper {
	#last?: Clock.Instant;
	#pending = Clock.Duration.ZERO;

	/** Return how many steps elapsed since the previous call on the installed clock; the first call returns 0. */
	advance(): number {
		const now = Clock.now();
		const last = this.#last;
		this.#last = now;
		if (!last) return 0;

		const pending = this.#pending.add(now.since(last));
		const steps = Math.floor(pending.divDuration(STEP));
		if (steps >= MAX_STEPS) {
			this.#pending = Clock.Duration.ZERO;
			return MAX_STEPS;
		}

		this.#pending = pending.sub(STEP.mul(steps));
		return steps;
	}
}

/** Drag and zoom wobble on a tile, decaying back to rest one step at a time. */
export class Deform {
	/** The drag wobble, in pixels of pull. */
	velocity = Vector.create(0, 0);
	/** The zoom wobble: positive while growing, negative while shrinking. */
	zoom = 0;

	/** Whether the wobble is strong enough to draw on the subdivided mesh. */
	get active(): boolean {
		return this.velocity.length() > DRAG_THRESHOLD || Math.abs(this.zoom) > ZOOM_THRESHOLD;
	}

	/** Decay the wobble by one step. */
	step() {
		this.velocity = this.velocity.length() > REST ? this.velocity.mult(DRAG_DECAY) : Vector.create(0, 0);
		this.zoom = Math.abs(this.zoom) > REST ? this.zoom * ZOOM_DECAY : 0;
	}
}

/** The push on `a` away from an overlapping `b`, growing with the overlap; `b` gets the opposite push. */
export function repel(a: Bounds, b: Bounds): Vector | undefined {
	const overlap = a.intersects(b);
	if (!overlap) return;

	const strength = (2 * overlap.area()) / (a.area() + b.area());
	let away = a.middle().sub(b.middle());

	// Tiles with identical centers have no direction between them, so split them horizontally.
	if (away.x === 0 && away.y === 0) away = Vector.create(1, 0);

	return away.mult(strength);
}
