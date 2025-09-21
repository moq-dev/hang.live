import {
	AutoTokenizer,
	PreTrainedTokenizer,
	RawAudio,
	StyleTextToSpeech2Model,
	Tensor,
} from "@huggingface/transformers";
import { phonemize } from "./phonemize";
import { Progress } from "./progress";

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

const modelName = "kitten-tts-0.1";
const voicesURL = `/models/${modelName}/voices`;

export class TTS {
	#model: Promise<StyleTextToSpeech2Model>;
	#tokenizer: Promise<PreTrainedTokenizer>;
	#voice: Promise<Float32Array>;
	#progress: Progress;

	constructor() {
		this.#progress = new Progress();

		this.#model = StyleTextToSpeech2Model.from_pretrained(modelName, {
			dtype: "q8",
			progress_callback: this.#progress.update.bind(this.#progress),
		});
		this.#tokenizer = AutoTokenizer.from_pretrained(modelName);
		this.#voice = fetch(`${voicesURL}/${DEFAULT_VOICE}.bin`)
			.then((response) => response.arrayBuffer())
			.then((arrayBuffer) => new Float32Array(arrayBuffer));
	}

	async ready(): Promise<boolean> {
		return !!(await this.#model);
	}

	async progress(): Promise<number> {
		return this.#progress.next();
	}

	async generate(text: string, speed = 1.2): Promise<string> {
		const phonemes = await phonemize(text);

		const tokenizer = await this.#tokenizer;
		const { input_ids } = await tokenizer(phonemes, {
			truncation: true,
		});

		const voice = await this.#voice;

		// Prepare model inputs
		const inputs = {
			input_ids,
			style: new Tensor("float32", voice, [1, voice.length]),
			speed: new Tensor("float32", [speed], [1]),
		};

		const model = await this.#model;

		// Generate audio
		const { waveform } = await model(inputs);
		const wav = new RawAudio(waveform.data, 24000);

		return URL.createObjectURL(wav.toBlob());
	}
}
