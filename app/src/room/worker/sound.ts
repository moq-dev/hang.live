import * as Comlink from "comlink";
import { KokoroTTS } from "kokoro-js";
import { detectWebGPU } from "./util";

// Get Voice type from an instance's voices property
export type Voice = KokoroTTS extends { voices: infer V } ? keyof V : never;

export class SoundWorker {
	#model: Promise<KokoroTTS>;

	constructor() {
		const device = detectWebGPU().then((webgpu) => (webgpu ? "webgpu" : "wasm"));

		// Load the model
		const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
		this.#model = device.then((device) =>
			KokoroTTS.from_pretrained(model_id, {
				dtype: device === "wasm" ? "q8" : "fp32",
				device,
			}),
		);
	}

	async ready(): Promise<boolean> {
		await this.#model;
		return true;
	}

	async tts(text: string, voice: Voice): Promise<string> {
		const tts = await this.#model;
		const audio = await tts.generate(text, { voice });
		const blob = audio.toBlob();
		return URL.createObjectURL(blob);
	}
}

// Expose the worker API via Comlink
Comlink.expose(new SoundWorker());
