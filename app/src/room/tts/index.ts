import * as Comlink from "comlink";
import * as Kitten from "./kitten";
import * as Kokoro from "./kokoro";

async function detectWebGPU() {
	try {
		// @ts-expect-error - navigator.gpu is not typed yet
		const adapter = await navigator.gpu.requestAdapter();
		return !!adapter;
	} catch {
		return false;
	}
}

export class TTS {
	#cpu: Promise<Kitten.TTS>;
	#gpu: Promise<Kokoro.TTS | undefined>;

	constructor() {
		this.#cpu = Kitten.TTS.load();
		// Only start loading the GPU model after the CPU model is loaded, and if it's supported.
		this.#gpu = this.#cpu.then(() => detectWebGPU()).then((webgpu) => (webgpu ? Kokoro.TTS.load() : undefined));
	}

	async ready(): Promise<boolean> {
		await Promise.race([this.#cpu, this.#gpu]);
		return true;
	}

	async generate(text: string): Promise<string> {
		let tts = await Promise.any([this.#gpu, this.#cpu]);
		if (!tts) tts = await this.#cpu;
		return tts.generate(text);
	}
}

// Expose the worker API via Comlink
Comlink.expose(new TTS());
