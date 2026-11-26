// Transcribes microphone audio with Whisper on WebGPU, off the main thread. Loaded only when a user
// turns transcription on, so the model and its runtime stay out of the room bundle.
import { type AutomaticSpeechRecognitionPipeline, pipeline } from "@huggingface/transformers";
import { Duration } from "@moq/clock";
import { type Job, Resampler, SAMPLE_RATE, Segmenter, split, tidy } from "./segment";

/** A message the page sends the worker. */
export type Request =
	| { type: "init"; language: string; translate: boolean }
	// `end` is the media-clock time of the chunk's last sample, in microseconds.
	| { type: "audio"; samples: Float32Array; rate: number; end: number }
	// The microphone stopped: forget the utterance in progress and anything waiting on it.
	| { type: "reset" };

/** A message the worker sends the page. `at` is a media-clock time in microseconds. */
export type Response =
	| { type: "progress"; loaded: number }
	| { type: "ready" }
	| { type: "cue"; track: "source" | "translation"; text: string; at: number }
	| { type: "clear"; track: "source" | "translation"; at: number }
	| { type: "error"; message: string };

// The English-only model transcribes English better; the multilingual one also translates to it.
const ENGLISH = "onnx-community/whisper-base.en";
const MULTILINGUAL = "onnx-community/whisper-base";

// How long each extra caption of a long translation stays up before the next replaces it.
const READ = Duration.secs(3);

// Finished utterances waiting behind a slow transcription. Past this the oldest are dropped, so a GPU
// slower than speech falls behind by a bounded amount instead of growing without end.
const MAX_QUEUE = 4;

let language = "en";
let translate = false;
let model: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
// Audio is dropped until the model loads, so speech from before captions were ready isn't replayed late.
let ready = false;
let resampler: Resampler | undefined;
let segmenter = new Segmenter();
// Bumped by every reset, so a transcription already running when it came posts nothing.
let generation = 0;
// When the last translated caption has had its time on screen, in media-clock microseconds.
let translated = 0;
const queue: Job[] = [];
let busy = false;

function post(message: Response) {
	self.postMessage(message);
}

function load(name: string): Promise<AutomaticSpeechRecognitionPipeline> {
	const files = new Map<string, number>();
	return pipeline("automatic-speech-recognition", name, {
		device: "webgpu",
		dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
		progress_callback: (info) => {
			if (info.status !== "progress") return;
			files.set(info.file, info.progress / 100);
			let sum = 0;
			for (const loaded of files.values()) sum += loaded;
			post({ type: "progress", loaded: sum / files.size });
		},
	});
}

// Transcription stops for good: the page shows the error and the user can turn it off and on again.
function fail(err: unknown) {
	ready = false;
	model = undefined;
	queue.length = 0;
	post({ type: "error", message: err instanceof Error ? err.message : String(err) });
}

function enqueue(job: Job) {
	// A newer partial makes any waiting one stale.
	if (job.kind === "partial") {
		const stale = queue.findIndex((queued) => queued.kind === "partial");
		if (stale >= 0) queue.splice(stale, 1);
	}
	queue.push(job);

	const finals = queue.filter((queued) => queued.kind === "final");
	if (finals.length > MAX_QUEUE) {
		console.warn("captions: transcription is falling behind, dropping an utterance");
		queue.splice(queue.indexOf(finals[0]), 1);
	}

	void drain();
}

async function drain() {
	if (busy || model === undefined) return;
	busy = true;
	try {
		const asr = await model;
		for (let job = queue.shift(); job; job = queue.shift()) {
			const at = job.end.asMicros();
			if (job.kind === "clear") {
				// A long translation's later captions are still up; clear the track after them.
				post({ type: "clear", track: "source", at });
				if (translate) post({ type: "clear", track: "translation", at: Math.max(at, translated) });
				continue;
			}

			const current = generation;
			const text = tidy(await transcribe(asr, job.audio, "transcribe"));
			if (current !== generation) continue;
			if (text) post({ type: "cue", track: "source", text, at });

			// Translating only finished utterances halves the work and keeps the second track from flickering.
			if (translate && job.kind === "final") {
				const parts = split(await transcribe(asr, job.audio, "translate"));
				if (current !== generation) continue;
				// No partial showed this text, so a long one is shown in turns rather than cut short.
				parts.forEach((part, i) => {
					post({ type: "cue", track: "translation", text: part, at: at + READ.asMicros() * i });
				});
				if (parts.length > 0) translated = at + READ.asMicros() * parts.length;
			}
		}
	} catch (err) {
		fail(err);
	} finally {
		busy = false;
	}
}

async function transcribe(
	asr: AutomaticSpeechRecognitionPipeline,
	audio: Float32Array,
	task: "transcribe" | "translate",
): Promise<string> {
	// The English-only model takes no language or task.
	const options = language === "en" ? {} : { language, task };
	const result = await asr(audio, options);
	if (Array.isArray(result)) throw new Error("captions: expected one transcript");
	return result.text;
}

self.addEventListener("message", (event: MessageEvent<Request>) => {
	const message = event.data;
	if (message.type === "init") {
		if (model !== undefined) throw new Error("captions: worker already initialized");
		language = message.language;
		translate = message.translate;
		// The first run compiles the GPU shaders, which would otherwise delay the first caption.
		model = load(language === "en" ? ENGLISH : MULTILINGUAL).then(async (asr) => {
			await asr(new Float32Array(SAMPLE_RATE));
			return asr;
		});
		model.then(
			() => {
				ready = true;
				post({ type: "ready" });
				void drain();
			},
			(err: unknown) => fail(err),
		);
		return;
	}

	if (message.type === "reset") {
		generation++;
		segmenter = new Segmenter();
		queue.length = 0;
		return;
	}

	if (!ready) return;
	if (resampler?.rate !== message.rate) resampler = new Resampler(message.rate);
	const samples = resampler.push(message.samples);
	for (const job of segmenter.push(samples, Duration.micros(message.end))) enqueue(job);
});
