// Configure transformers.js and ONNX runtime
import * as Comlink from "comlink";
import * as Kokoro from "./kokoro";

export type Quality = "none" | "low" | "high";

async function detectWebGPU() {
	try {
		const adapter = await navigator.gpu.requestAdapter();
		return !!adapter;
	} catch {
		return false;
	}
}
const supportsWebGPU = detectWebGPU();

export class TTSWorker {
	#model: Kokoro.TTS | undefined;
	#quality: Quality;

	constructor(quality: Quality) {
		this.#quality = quality;
		this.#model = this.#init();
	}

	#init(): Kokoro.TTS | undefined {
		if (this.#quality === "none") {
			return undefined;
		} else if (this.#quality === "high") {
			return new Kokoro.TTS();
		} else if (this.#quality === "low") {
			throw new Error("Low quality TTS cannot be used with the worker");
		} else {
			const quality: never = this.#quality;
			throw new Error(`Invalid quality: ${quality}`);
		}
	}

	setQuality(quality: Quality) {
		this.#quality = quality;
		this.#model = this.#init();
	}

	async ready(): Promise<boolean> {
		return this.#model?.ready() ?? true;
	}

	async progress(): Promise<number> {
		return this.#model?.progress() ?? 1;
	}

	async generate(text: string): Promise<string | undefined> {
		return this.#model?.generate(text);
	}

	static supportsHigh(): Promise<boolean> {
		return supportsWebGPU;
	}
}

// Expose the worker API via Comlink
Comlink.expose(new TTSWorker("none"));
