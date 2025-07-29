import type { AudioFrame } from ".";

class Capture extends AudioWorkletProcessor {
	#sampleCount = 0;

	process(input: Float32Array[][]) {
		if (input.length > 1) throw new Error("only one input is supported.");

		const channels = input[0];
		if (!channels) throw new Error("no channels");

		const SCALING_FACTOR = Math.sqrt(2);

		const samples = channels[0];
		if (!samples) throw new Error("no samples");

		this.port.postMessage({ samples }, [samples.buffer]);

		return true;
	}
}

registerProcessor("capture", Capture);
