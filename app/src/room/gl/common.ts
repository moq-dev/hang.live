/**
 * Manages common uniform values shared across multiple shaders.
 * Computes values like time once per frame.
 */
export class CommonUniforms {
	#startTime: number;
	#currentTime: number = 0;

	constructor() {
		this.#startTime = performance.now();
	}

	/**
	 * Update computed values for the current frame.
	 * Call this once per frame before rendering.
	 */
	update(now: DOMHighResTimeStamp) {
		this.#currentTime = (now - this.#startTime) / 1000;
	}

	/**
	 * Get time value in seconds since creation.
	 */
	get time(): number {
		return this.#currentTime;
	}
}
