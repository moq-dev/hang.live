import * as Comlink from "comlink";
import * as Kitten from "./kitten";
import * as Kokoro from "./kokoro";

export type Quality = "none" | "low" | "high";

async function detectWebGPU() {
	try {
		// @ts-expect-error - navigator.gpu is not typed yet
		const adapter = await navigator.gpu.requestAdapter();
		return !!adapter;
	} catch {
		return false;
	}
}
const supportsWebGPU = detectWebGPU();

export class TTS {
	#model: Promise<Kitten.TTS | Kokoro.TTS | undefined>;
	#quality: Quality;

	constructor(quality: Quality) {
		this.#quality = quality;
		this.#model = this.#init();
	}

	async #init(): Promise<Kitten.TTS | Kokoro.TTS | undefined> {
		if (this.#quality === "none") return undefined;

		if (this.#quality === "high"){
			if (await TTS.supportsHigh()) {
				return Kokoro.TTS.load();
			} else {
				console.warn("WebGPU not available, falling back to low quality TTS");
			}
		}

		return Kitten.TTS.load();
	}

	setQuality(quality: Quality) {
		this.#quality = quality;
		this.#model = this.#init();
	}

	async loaded(): Promise<boolean> {
		return !!(await this.#model);
	}

	async generate(text: string): Promise<string | undefined> {
		const model = await this.#model;
		return model?.generate(text);
	}

	static supportsHigh(): Promise<boolean> {
		return supportsWebGPU;
	}
}

// Expose the worker API via Comlink
Comlink.expose(new TTS("none"));
