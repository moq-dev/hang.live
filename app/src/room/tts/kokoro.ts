import { KokoroTTS } from "kokoro-js";
import { Progress } from "./progress";

export type Voice = KokoroTTS extends { voices: infer V } ? keyof V : never;

const modelName = "onnx-community/Kokoro-82M-v1.0-ONNX";

export class TTS {
	#progress: Progress;
	#model: Promise<KokoroTTS>;

	constructor() {
		this.#progress = new Progress();

		this.#model = KokoroTTS.from_pretrained(modelName, {
			dtype: "fp32", // TODO investigate the best setting
			device: "webgpu",
			progress_callback: this.#progress.update.bind(this.#progress),
		});
	}

	async ready(): Promise<boolean> {
		return !!(await this.#model);
	}

	async progress(): Promise<number> {
		return this.#progress.next();
	}

	async generate(text: string, props?: { voice?: Voice; speed?: number }): Promise<string> {
		const model = await this.#model;

		const audio = await model.generate(text, {
			voice: props?.voice || "af_bella",
			speed: props?.speed || 1.0,
		});
		const blob = audio.toBlob();
		return URL.createObjectURL(blob);
	}
}
