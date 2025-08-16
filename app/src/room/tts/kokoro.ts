import { KokoroTTS } from "kokoro-js";

export type Voice = KokoroTTS extends { voices: infer V } ? keyof V : never;

const modelName = "onnx-community/Kokoro-82M-v1.0-ONNX";

export class TTS {
	#model: KokoroTTS;

	constructor(model: KokoroTTS) {
		this.#model = model;
	}

	static async load(): Promise<TTS> {
		const model = await KokoroTTS.from_pretrained(modelName, {
			dtype: "fp32",
			device: "webgpu",
		});
		return new TTS(model);
	}

	async generate(text: string, props?: { voice?: Voice; speed?: number }): Promise<string> {
		const audio = await this.#model.generate(text, {
			voice: props?.voice || "af_bella",
			speed: props?.speed || 1.0,
		});
		const blob = audio.toBlob();
		return URL.createObjectURL(blob);
	}
}
