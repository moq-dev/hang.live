import { Duration } from "@moq/clock";

/** The rate Whisper expects its audio at. */
export const SAMPLE_RATE = 16_000;

// Everything below counts 20 ms frames, so the audio itself is the clock and nothing reads time.
const FRAME = SAMPLE_RATE / 50;
const FRAME_TIME = Duration.millis(20);

// Audio kept from before speech starts, so the first syllable isn't clipped.
const PREROLL = 15;
// Silence that ends an utterance.
const HANGOVER = 35;
// How much new speech a partial transcript waits for.
const PARTIAL = 50;
// The longest utterance transcribed as one; Whisper's window is 30 s, and shorter keeps it fast.
const MAX_UTTERANCE = 750;
// Speech shorter than this is a click or a cough, not worth a transcript.
const MIN_SPEECH = 10;
// How long a finished caption stays up before it is cleared.
const HOLD = 150;

// Speech is this many times louder than the noise floor, and never quieter than the minimum level.
const SPEECH_RATIO = 4;
const SPEECH_MIN = 0.01;
const FLOOR_MIN = 0.002;
// The noise floor is the quietest frame this recently. Speech pauses between words far more often,
// so a steady hum or fan sets the floor while a talker never does.
const FLOOR_WINDOW = 250;

/**
 * Work for the transcriber: an utterance so far (`partial`), a finished one (`final`), or the end of
 * the caption (`clear`). `end` is the media-clock time of the last sample covered, which is when the
 * caption is stamped: the earliest the words could be known, so a caption never precedes its speech.
 */
export type Job = { kind: "partial" | "final"; audio: Float32Array; end: Duration } | { kind: "clear"; end: Duration };

/**
 * Splits 16 kHz mono audio into utterances with an energy detector, emitting a partial transcript
 * job every second of speech, a final job when the speaker pauses, and a clear once they stay quiet.
 */
export class Segmenter {
	// A frame not yet filled by the chunks pushed so far.
	#frame = new Float32Array(FRAME);
	#filled = 0;

	// Recent frame levels, a ring, for the noise floor.
	#levels: number[] = [];
	#level = 0;

	// The utterance being collected, or the preroll ring while idle.
	#utterance = new Float32Array((PREROLL + MAX_UTTERANCE) * FRAME);
	#frames = 0;
	#preroll: Float32Array[] = [];

	#active = false;
	#speech = 0;
	#silence = 0;
	#sincePartial = 0;

	// Frames of silence since the last caption, while one is still showing.
	#shown: number | undefined;

	/**
	 * Add audio whose last sample was captured at `end`, returning the jobs it completes.
	 */
	push(samples: Float32Array, end: Duration): Job[] {
		const jobs: Job[] = [];
		for (let offset = 0; offset < samples.length; ) {
			const take = Math.min(FRAME - this.#filled, samples.length - offset);
			this.#frame.set(samples.subarray(offset, offset + take), this.#filled);
			this.#filled += take;
			offset += take;
			if (this.#filled < FRAME) break;

			this.#filled = 0;
			// The samples after this frame were captured after it, so it ended that much earlier.
			const at = end.saturatingSub(Duration.micros(((samples.length - offset) * 1_000_000) / SAMPLE_RATE));
			this.#step(this.#frame, at, jobs);
		}
		return jobs;
	}

	#step(frame: Float32Array, end: Duration, jobs: Job[]) {
		let sum = 0;
		for (const sample of frame) sum += sample * sample;
		const level = Math.sqrt(sum / frame.length);
		this.#levels[this.#level] = level;
		this.#level = (this.#level + 1) % FLOOR_WINDOW;
		const floor = Math.max(FLOOR_MIN, Math.min(...this.#levels));
		const speech = level > Math.max(SPEECH_MIN, floor * SPEECH_RATIO);

		if (!this.#active) {
			if (!speech) {
				this.#preroll.push(frame.slice());
				if (this.#preroll.length > PREROLL) this.#preroll.shift();

				if (this.#shown !== undefined && ++this.#shown >= HOLD) {
					jobs.push({ kind: "clear", end });
					this.#shown = undefined;
				}
				return;
			}

			this.#begin();
			for (const previous of this.#preroll) this.#append(previous);
			this.#preroll = [];
		}

		this.#append(frame);
		if (speech) {
			this.#speech++;
			this.#sincePartial++;
			this.#silence = 0;
		} else {
			this.#silence++;
		}

		if (this.#silence >= HANGOVER) {
			this.#finish(end, jobs);
			this.#active = false;
		} else if (this.#frames >= PREROLL + MAX_UTTERANCE) {
			// Too long to hold as one: finish it and carry on with a fresh one, still speaking.
			this.#finish(end, jobs);
			this.#begin();
		} else if (this.#sincePartial >= PARTIAL && this.#speech >= MIN_SPEECH) {
			jobs.push({ kind: "partial", audio: this.#audio(), end });
			this.#sincePartial = 0;
			this.#shown = 0;
		}
	}

	#begin() {
		this.#active = true;
		this.#frames = 0;
		this.#speech = 0;
		this.#silence = 0;
		this.#sincePartial = 0;
	}

	#append(frame: Float32Array) {
		this.#utterance.set(frame, this.#frames * FRAME);
		this.#frames++;
	}

	#finish(end: Duration, jobs: Job[]) {
		if (this.#speech < MIN_SPEECH) return;
		// Drop the trailing silence, keeping a little so the last word isn't cut.
		const trailing = Math.max(this.#silence - 10, 0);
		const frames = this.#frames - trailing;
		jobs.push({
			kind: "final",
			audio: this.#utterance.slice(0, frames * FRAME),
			end: end.saturatingSub(FRAME_TIME.mul(trailing)),
		});
		this.#shown = 0;
	}

	#audio(): Float32Array {
		return this.#utterance.slice(0, this.#frames * FRAME);
	}
}

/**
 * Converts audio to {@link SAMPLE_RATE} by linear interpolation, carrying its phase across chunks so
 * consecutive chunks resample as one stream.
 */
export class Resampler {
	/** The input rate. */
	readonly rate: number;
	readonly #step: number;
	// Where the next output sample falls, in input samples relative to the next chunk's first.
	#position = 0;
	#last = 0;

	constructor(rate: number) {
		if (!(rate >= SAMPLE_RATE)) throw new Error(`captions: unsupported capture rate ${rate}`);
		this.rate = rate;
		this.#step = rate / SAMPLE_RATE;
	}

	/** Resample one chunk. */
	push(input: Float32Array): Float32Array {
		const output: number[] = [];
		let position = this.#position;
		while (position < input.length - 1) {
			const index = Math.floor(position);
			const before = index < 0 ? this.#last : input[index];
			const after = input[index + 1];
			output.push(before + (after - before) * (position - index));
			position += this.#step;
		}
		this.#position = position - input.length;
		if (input.length > 0) this.#last = input[input.length - 1];
		return Float32Array.from(output);
	}
}

// The most a caption shows: a roll-up caption keeps only its latest words, like a broadcast's.
const MAX_TEXT = 160;

// Whisper's markers for audio without words, such as `[BLANK_AUDIO]` or `(music)`.
const NON_SPEECH = /^[[(][^\])]*[\])]$/;

/**
 * Turn a transcript into caption text: trimmed, cut to its last {@link MAX_TEXT} characters on a word
 * boundary, and empty when Whisper heard no words.
 */
export function tidy(transcript: string): string {
	const text = transcript.trim().replace(/\s+/g, " ");
	if (NON_SPEECH.test(text)) return "";
	if (text.length <= MAX_TEXT) return text;

	const tail = text.slice(-MAX_TEXT);
	const space = tail.indexOf(" ");
	return `…${space >= 0 ? tail.slice(space + 1) : tail}`;
}
