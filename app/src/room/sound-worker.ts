import * as Comlink from "comlink";
import { pipeline, env } from "@huggingface/transformers";

// Configure transformers.js environment
env.allowLocalModels = false;

// For now, Kitten TTS doesn't have multiple voices like Kokoro
export type Voice = "default";

export class SoundWorker {
	#model: Promise<any>;

	constructor() {
		// Load the Kitten TTS model
		const model_id = "onnx-community/kitten-tts-nano-0.1-ONNX";
		this.#model = pipeline("text-to-speech", model_id);
	}

	async ready(): Promise<boolean> {
		await this.#model;
		return true;
	}

	async tts(text: string, _voice: Voice): Promise<string> {
		const synthesizer = await this.#model;
		const output = await synthesizer(text);
		
		// Convert the audio output to a blob
		const audioData = output.audio;
		const sampleRate = output.sampling_rate;
		
		// Create WAV file from the audio data
		const wavBlob = createWavBlob(audioData, sampleRate);
		return URL.createObjectURL(wavBlob);
	}
}

// Helper function to create a WAV blob from audio data
function createWavBlob(audioData: Float32Array, sampleRate: number): Blob {
	const length = audioData.length;
	const buffer = new ArrayBuffer(44 + length * 2);
	const view = new DataView(buffer);

	// WAV header
	const writeString = (offset: number, string: string) => {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	};

	writeString(0, "RIFF");
	view.setUint32(4, 36 + length * 2, true);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeString(36, "data");
	view.setUint32(40, length * 2, true);

	// Convert float samples to 16-bit PCM
	let offset = 44;
	for (let i = 0; i < length; i++) {
		const sample = Math.max(-1, Math.min(1, audioData[i]));
		view.setInt16(offset, sample * 0x7fff, true);
		offset += 2;
	}

	return new Blob([buffer], { type: "audio/wav" });
}

// Expose the worker API via Comlink
Comlink.expose(new SoundWorker());
