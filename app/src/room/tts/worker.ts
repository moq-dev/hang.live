import * as Comlink from "comlink";
import * as Kokoro from "./kokoro";

// Runs the Kokoro model off the main thread; only spawned for high-quality speech.
export class TTSWorker {
	#model = new Kokoro.TTS();

	async progress(): Promise<number> {
		return this.#model.progress();
	}

	async generate(text: string): Promise<string> {
		return this.#model.generate(text);
	}
}

Comlink.expose(new TTSWorker());
