// Configure transformers.js and ONNX runtime
import { env } from "@huggingface/transformers";
import * as Comlink from "comlink";
import * as Kitten from "./kitten";
import * as Kokoro from "./kokoro";

// We serve KittenTTS and Onnx locally so they get bundled with the app.
// Larger and more expensive models get loaded at runtime.
env.allowLocalModels = true;
env.allowRemoteModels = true; // Kokoro
env.localModelPath = "/models";

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

export class TTSWorker {
	#model: Kitten.TTS | Kokoro.TTS | undefined;
	#quality: Quality;

	constructor(quality: Quality) {
		this.#quality = quality;
		this.#model = this.#init();
	}

	#init(): Kitten.TTS | Kokoro.TTS | undefined {
		if (this.#quality === "none") {
			return undefined;
		} else if (this.#quality === "high") {
			return new Kokoro.TTS();
		} else if (this.#quality === "low") {
			return new Kitten.TTS();
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
