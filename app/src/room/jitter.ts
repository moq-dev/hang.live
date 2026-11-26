// How many sampled intervals the baseline spans: the sparkline's history, so its floor is on screen.
const WINDOW = 120;

/**
 * Arrival jitter for one track: how much later than its steadiest recent frame a frame arrived.
 *
 * Each frame's arrival minus its media timestamp is a constant clock offset plus its network delay,
 * so the lowest offset in the window is the baseline and anything above it is jitter. Feed it every
 * arrival, then {@link sample} once per graph tick.
 */
export class Jitter {
	// The lowest offset of each sampled interval that had an arrival, oldest first.
	#floors: number[] = [];
	#last?: { timestamp: number; wall: number };
	// The offsets seen since the last sample.
	#interval?: { min: number; max: number };

	/** Record a frame with media `timestamp` arriving at `wall`, both in milliseconds. */
	arrive(timestamp: number, wall: number): void {
		const last = this.#last;
		// A decoder reports its newest arrival again whenever another counter moves.
		if (last && timestamp === last.timestamp) return;
		// A new timeline's offsets have nothing to do with the old one's.
		if (last && timestamp < last.timestamp) {
			this.#floors = [];
			this.#interval = undefined;
		}
		this.#last = { timestamp, wall };

		const offset = wall - timestamp;
		const interval = this.#interval;
		this.#interval = interval
			? { min: Math.min(interval.min, offset), max: Math.max(interval.max, offset) }
			: { min: offset, max: offset };
	}

	/**
	 * Close the interval ending at `wall` (milliseconds), returning how far its latest arrival trailed
	 * the baseline, or undefined before any frame. An interval without arrivals reports how late a
	 * frame landing now would be, so a gap ramps up instead of reading as zero.
	 */
	sample(wall: number): number | undefined {
		const last = this.#last;
		if (!last) return undefined;

		const interval = this.#interval;
		this.#interval = undefined;
		if (interval) {
			this.#floors.push(interval.min);
			if (this.#floors.length > WINDOW) this.#floors.shift();
		}

		const worst = interval ? interval.max : wall - last.timestamp;
		return Math.max(0, worst - Math.min(...this.#floors));
	}
}
