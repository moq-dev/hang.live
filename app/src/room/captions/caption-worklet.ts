// Batches the microphone's first channel into chunks for the captions worker. A render quantum is
// only 128 samples, so posting each one would be hundreds of messages a second.
const CHUNK = 2048;

// The app's DOM typings lack the worklet scope; these are the two pieces it uses.
declare abstract class AudioWorkletProcessor {
	readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class Captions extends AudioWorkletProcessor {
	#chunk = new Float32Array(CHUNK);
	#filled = 0;

	process(inputs: Float32Array[][]) {
		const input = inputs[0]?.[0];
		if (!input) return true;

		for (let offset = 0; offset < input.length; ) {
			const take = Math.min(CHUNK - this.#filled, input.length - offset);
			this.#chunk.set(input.subarray(offset, offset + take), this.#filled);
			this.#filled += take;
			offset += take;

			if (this.#filled === CHUNK) {
				this.port.postMessage(this.#chunk, [this.#chunk.buffer]);
				this.#chunk = new Float32Array(CHUNK);
				this.#filled = 0;
			}
		}
		return true;
	}
}

registerProcessor("captions", Captions);

export {};
