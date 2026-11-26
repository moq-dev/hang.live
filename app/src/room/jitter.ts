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
	 * Close the interval since the last sample, returning how far its latest arrival trailed the
	 * baseline in milliseconds, or undefined when no frame arrived in it. A publisher sends nothing
	 * through a mute or a pause in speech, so an empty interval is no evidence of a late network.
	 */
	sample(): number | undefined {
		const interval = this.#interval;
		if (!interval) return undefined;
		this.#interval = undefined;

		this.#floors.push(interval.min);
		if (this.#floors.length > WINDOW) this.#floors.shift();
		return Math.max(0, interval.max - Math.min(...this.#floors));
	}
}
