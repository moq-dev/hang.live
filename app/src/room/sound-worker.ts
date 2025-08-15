import {
	AutoTokenizer,
	PreTrainedTokenizer,
	RawAudio,
	StyleTextToSpeech2Model,
	Tensor,
} from "@huggingface/transformers";
import * as Comlink from "comlink";
import { phonemize } from "./phonemize";

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

const voiceDataUrl = "https://huggingface.co/onnx-community/kitten-tts-nano-0.1-ONNX/resolve/main/voices";

export class SoundWorker {
	#model: Promise<StyleTextToSpeech2Model>;
	#tokenizer: Promise<PreTrainedTokenizer>;
	#voiceCache = new Map<Voice, Promise<Float32Array>>();

	constructor() {
		// Load the model
		const model_id = "onnx-community/kitten-tts-nano-0.1-ONNX";
		this.#model = StyleTextToSpeech2Model.from_pretrained(model_id, {
			dtype: "q8",
		});
		this.#tokenizer = AutoTokenizer.from_pretrained(model_id);
	}

	async ready(): Promise<boolean> {
		await this.#model;
		await this.#tokenizer;
		return true;
	}

	async tts(
		text: string,
		{ voice = "expr-voice-5-f", speed = 1.0 }: { voice?: Voice; speed?: number },
	): Promise<string> {
		const voiceData = await this.#voiceData(voice);

		const phonemes = await phonemize(text, "en");

		const tokenizer = await this.#tokenizer;
		const { input_ids } = await tokenizer(phonemes, {
			truncation: true,
		});

		// Prepare model inputs
		const inputs = {
			input_ids,
			style: new Tensor("float32", voiceData, [1, voiceData.length]),
			speed: new Tensor("float32", [speed], [1]),
		};

		// Generate audio
		const model = await this.#model;
		const { waveform } = await model(inputs);
		const wav = new RawAudio(waveform.data, 24000);

		return URL.createObjectURL(wav.toBlob());
	}

	#voiceData(voice: Voice): Promise<Float32Array> {
		let cache = this.#voiceCache.get(voice);
		if (!cache) {
			const url = `${voiceDataUrl}/${voice}.bin`;
			cache = fetch(url)
				.then((response) => response.arrayBuffer())
				.then((arrayBuffer) => new Float32Array(arrayBuffer));
			this.#voiceCache.set(voice, cache);
		}
		return cache;
	}
}

// Expose the worker API via Comlink
Comlink.expose(new SoundWorker());
