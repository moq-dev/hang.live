import {
	AutoTokenizer,
	PreTrainedTokenizer,
	RawAudio,
	StyleTextToSpeech2Model,
	Tensor,
} from "@huggingface/transformers";
import { phonemize } from "./phonemize";

/*
const VOICES = [
	"expr-voice-2-f",
	"expr-voice-2-m",
	"expr-voice-3-f",
	"expr-voice-3-m",
	"expr-voice-4-f",
	"expr-voice-4-m",
	"expr-voice-5-f",
	"expr-voice-5-m",
] as const;

export type Voice = (typeof VOICES)[number];
*/

const DEFAULT_VOICE = "expr-voice-5-f";

const voicesURL = "https://huggingface.co/onnx-community/kitten-tts-nano-0.1-ONNX/resolve/main/voices";
const modelName = "onnx-community/kitten-tts-nano-0.1-ONNX";

export class TTS {
	#model: StyleTextToSpeech2Model;
	#tokenizer: PreTrainedTokenizer;
	#voice: Float32Array;

	constructor(model: StyleTextToSpeech2Model, tokenizer: PreTrainedTokenizer, voice: Float32Array) {
		this.#model = model;
		this.#tokenizer = tokenizer;
		this.#voice = voice;
	}

	static async load(): Promise<TTS> {
		const model = StyleTextToSpeech2Model.from_pretrained(modelName, {
			dtype: "q8",
		});
		const tokenizer = AutoTokenizer.from_pretrained(modelName);
		const voice = fetch(`${voicesURL}/${DEFAULT_VOICE}.bin`)
			.then((response) => response.arrayBuffer())
			.then((arrayBuffer) => new Float32Array(arrayBuffer));

		return new TTS(await model, await tokenizer, await voice);
	}

	async generate(text: string, speed = 1.1): Promise<string> {
		const phonemes = await phonemize(text);

		const { input_ids } = await this.#tokenizer(phonemes, {
			truncation: true,
		});

		// Prepare model inputs
		const inputs = {
			input_ids,
			style: new Tensor("float32", this.#voice, [1, this.#voice.length]),
			speed: new Tensor("float32", [speed], [1]),
		};

		// Generate audio
		const { waveform } = await this.#model(inputs);
		const wav = new RawAudio(waveform.data, 24000);

		return URL.createObjectURL(wav.toBlob());
	}
}
