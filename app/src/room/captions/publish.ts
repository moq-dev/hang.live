import { Duration } from "@moq/clock";
import type * as Catalog from "@moq/hang/catalog";
import * as Container from "@moq/hang/container";
import type * as Moq from "@moq/net";
import * as Publish from "@moq/publish";
import { Effect, type Getter, Signal } from "@moq/signals";
import { supportsWebGPU } from "../../settings";
import worklet from "./caption-worklet.ts?worklet";
import type { Request, Response } from "./worker";

// How late a caption may be before transcription stops. Viewers would show it seconds after the
// words were heard, and drop it altogether past 30 s.
const MAX_LATE = Duration.secs(10);

/** What the captioner is doing, for the settings panel. */
export type Status =
	| { kind: "off" }
	| { kind: "loading"; progress: number }
	| { kind: "ready" }
	| { kind: "error"; message: string };

export interface CaptionerProps {
	/** The broadcast carrying the microphone, which the caption tracks join. */
	broadcast: Publish.Broadcast;
	/** The raw microphone graph while it's capturing. */
	root: Getter<AudioNode | undefined>;
	/** Whether to transcribe. */
	enabled: Getter<boolean>;
	/** The BCP-47 language spoken into the microphone. */
	language: Getter<string>;
}

/**
 * Publishes live captions of the microphone: Whisper transcribes it in a worker, and each caption is
 * a `utf8` cue on a `captions/<language>` text track, stamped on the broadcast's media clock. Speech
 * in another language also gets an English translation on `captions/en`.
 */
export class Captioner {
	/** Loading progress, readiness, or why transcription stopped. */
	readonly status = new Signal<Status>({ kind: "off" });
	/** The caption currently showing, for the speaker's own tile. */
	readonly text = new Signal<string | undefined>(undefined);

	readonly #props: CaptionerProps;
	readonly #signals = new Effect();

	constructor(props: CaptionerProps) {
		this.#props = props;
		this.#signals.run(this.#run.bind(this));
	}

	#run(effect: Effect) {
		if (!effect.get(this.#props.enabled)) return;
		if (!supportsWebGPU()) {
			effect.set(this.status, { kind: "error", message: "WebGPU is not supported" }, { kind: "off" });
			return;
		}

		const language = effect.get(this.#props.language);
		const translate = language !== "en";
		const source = this.#rendition(effect, `captions/${language}`, { lang: language });
		const translation = translate
			? this.#rendition(effect, "captions/en", { lang: "en", label: "English (translated)" })
			: undefined;

		const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
		effect.cleanup(() => worker.terminate());
		effect.set(this.status, { kind: "loading", progress: 0 }, { kind: "off" });
		effect.cleanup(() => this.text.set(undefined));

		// Stop for good, until transcription is turned off and on again.
		let stopped = false;
		// Counts microphone resets; a reply from before the latest one is stale.
		let generation = 0;
		const fail = (message: string) => {
			console.error("captions:", message);
			stopped = true;
			worker.terminate();
			this.text.set(undefined);
			this.status.set({ kind: "error", message });
		};

		worker.addEventListener("error", (event) => fail(event.message || "the captions worker failed"));
		worker.addEventListener("message", (event: MessageEvent<Response>) => {
			const message = event.data;
			if (stopped) return;
			if ((message.type === "cue" || message.type === "clear") && message.generation !== generation) return;
			// Viewers drop a caption this far behind their playback, so the device can't keep up.
			if (
				(message.type === "cue" || message.type === "clear") &&
				Publish.MediaClock.now().asMicros() - message.at > MAX_LATE.asMicros()
			) {
				fail("this device transcribes too slowly for live captions");
				return;
			}

			switch (message.type) {
				case "progress":
					this.status.set({ kind: "loading", progress: message.loaded });
					break;
				case "ready":
					this.status.set({ kind: "ready" });
					break;
				case "error":
					fail(message.message);
					break;
				case "cue":
					if (message.track === "source") {
						source.write(message.text, message.at);
						this.text.set(message.text);
					} else {
						translation?.write(message.text, message.at);
					}
					break;
				case "clear":
					source.write("", message.at);
					translation?.write("", message.at);
					this.text.set(undefined);
					break;
			}
		});
		const init: Request = { type: "init", language, translate };
		worker.postMessage(init);

		// Tap the microphone only while it captures; the model stays loaded across a mute.
		effect.run((inner) => {
			const root = inner.get(this.#props.root);
			if (!root) return;

			inner.spawn(async () => {
				const context = root.context;
				try {
					await context.audioWorklet.addModule(await worklet());
				} catch (err) {
					fail(`failed to tap the microphone: ${err}`);
					return;
				}
				if (inner.abort.aborted) return;

				const node = new AudioWorkletNode(context, "captions", { numberOfInputs: 1, numberOfOutputs: 0 });
				root.connect(node);
				inner.cleanup(() => {
					// A closing capture disconnects its whole root before this runs, removing the edge already.
					try {
						root.disconnect(node);
					} catch (err) {
						if (!(err instanceof DOMException && err.name === "InvalidAccessError")) throw err;
					}
				});
				// A muted speaker's caption ends with their audio, and their next words start afresh.
				inner.cleanup(() => {
					if (stopped) return;
					generation++;
					const reset: Request = { type: "reset", generation };
					worker.postMessage(reset);
					const at = Publish.MediaClock.now().asMicros();
					source.write("", at);
					translation?.write("", at);
					this.text.set(undefined);
				});
				inner.event(node.port, "message", (event) => {
					if (stopped) return;
					const samples = (event as MessageEvent<Float32Array>).data;
					const audio: Request = {
						type: "audio",
						samples,
						rate: context.sampleRate,
						end: Publish.MediaClock.now().asMicros(),
					};
					worker.postMessage(audio, [samples.buffer]);
				});
				node.port.start();
			});
		});
	}

	// Register a caption track for as long as `effect` runs, returning its cue writer.
	#rendition(effect: Effect, name: string, config: { lang: string; label?: string }): Writer {
		const rendition = this.#props.broadcast.text(name);
		effect.cleanup(() => rendition.close());
		rendition.config.set({
			format: "utf8",
			role: "caption",
			container: { kind: "legacy" },
			...config,
		} satisfies Catalog.TextConfig);

		const writer = new Writer();
		effect.run((inner) => {
			const track = inner.get(rendition.track);
			if (!track) return;
			writer.open(track);
			inner.cleanup(() => writer.close());
		});
		return writer;
	}

	close() {
		this.#signals.close();
	}
}

// Writes cues to whichever track is open, one group per cue, dropping them while none is.
class Writer {
	#producer: Container.Legacy.Producer | undefined;
	#last = 0;

	open(track: Moq.Track.Producer) {
		this.#producer = new Container.Legacy.Producer(track, new Container.Legacy.Format("data"));
	}

	close() {
		this.#producer = undefined;
	}

	// Write `text` at `at` microseconds; empty text clears the caption.
	write(text: string, at: number) {
		if (!this.#producer) return;
		// Each cue opens a group, which must start after the last one.
		const timestamp = Math.max(Math.round(at), this.#last + 1);
		this.#last = timestamp;
		this.#producer.encode(new TextEncoder().encode(text), Duration.micros(timestamp), true);
		// Close the group now, so a viewer shows the cue without waiting for the next one.
		this.#producer.cut();
	}
}
