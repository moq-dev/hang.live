import { expect, test } from "bun:test";
import { Duration } from "@moq/clock";
import { type Job, Resampler, SAMPLE_RATE, Segmenter, split, tidy } from "./segment";

// Speech louder than this is spoken in syllables: 200 ms on, then 100 ms back at the room's level.
const LOUD = 0.1;

// Feed `segments` of [seconds, amplitude] in 100 ms chunks, starting the media clock at 100 s.
function feed(segmenter: Segmenter, segments: [number, number][]): Job[] {
	const chunk = SAMPLE_RATE / 10;
	const jobs: Job[] = [];
	let end = Duration.secs(100);
	let phase = 0;
	let room = 0;
	for (const [seconds, amplitude] of segments) {
		if (amplitude < LOUD) room = amplitude;
		for (let i = 0; i < seconds * 10; i++) {
			const level = amplitude >= LOUD && i % 3 === 2 ? room : amplitude;
			const samples = new Float32Array(chunk);
			for (let n = 0; n < chunk; n++) samples[n] = level * Math.sin(phase++ * 0.3);
			end = end.add(Duration.millis(100));
			jobs.push(...segmenter.push(samples, end));
		}
	}
	return jobs;
}

const kinds = (jobs: Job[]) => jobs.map((job) => job.kind);
const secs = (job: Job) => job.end.asSecs();

test("an utterance emits partials, a final when the speaker pauses, then a clear", () => {
	const jobs = feed(new Segmenter(), [
		[1, 0.001],
		[3.5, 0.3],
		[5, 0.001],
	]);
	expect(kinds(jobs)).toEqual(["partial", "partial", "final", "clear"]);

	// Stamped at the end of the audio each covers, so captions never lead their speech: a partial
	// waits for a second of syllables, which take a second and a half to say.
	const [first, second, final, clear] = jobs;
	expect(Math.abs(secs(first) - 102.5)).toBeLessThan(0.2);
	expect(Math.abs(secs(second) - 104)).toBeLessThan(0.2);
	// The final ends a little after the last word, not at the end of the pause that ended it.
	expect(secs(final)).toBeGreaterThan(104.5);
	expect(secs(final)).toBeLessThan(104.8);
	expect(secs(clear)).toBeGreaterThan(secs(final) + 2.9);
});

test("the final covers the preroll before speech started", () => {
	const jobs = feed(new Segmenter(), [
		[1, 0.001],
		[0.5, 0.3],
		[2, 0.001],
	]);
	const final = jobs.find((job) => job.kind === "final");
	if (final?.kind !== "final") throw new Error("expected a final");
	// 300 ms of preroll, 500 ms of speech, and 200 ms of the trailing silence.
	expect(final.audio.length / SAMPLE_RATE).toBeCloseTo(1, 1);
});

test("a click too short for speech emits nothing", () => {
	expect(
		feed(new Segmenter(), [
			[1, 0.001],
			[0.1, 0.5],
			[5, 0.001],
		]),
	).toEqual([]);
});

test("a long monologue is split so no utterance exceeds Whisper's window", () => {
	const jobs = feed(new Segmenter(), [
		[0.5, 0.001],
		[40, 0.3],
		[2, 0.001],
	]);
	const finals = jobs.filter((job) => job.kind === "final");
	expect(finals.length).toBe(3);
	for (const final of finals) {
		if (final.kind !== "final") continue;
		expect(final.audio.length / SAMPLE_RATE).toBeLessThanOrEqual(15.3);
	}
	// Stamps only move forward, so each cue opens a later group.
	const ends = jobs.map(secs);
	expect(ends).toEqual([...ends].sort((a, b) => a - b));
});

test("speech resuming before the hold keeps the caption up instead of clearing it", () => {
	const jobs = feed(new Segmenter(), [
		[1, 0.001],
		[1.5, 0.3],
		[2, 0.001],
		[1.5, 0.3],
		[1, 0.001],
	]);
	expect(kinds(jobs)).toEqual(["partial", "final", "partial", "final"]);
});

test("the noise floor adapts, so a steady hum is not speech", () => {
	const jobs = feed(new Segmenter(), [
		[3, 0.02],
		[1.5, 0.3],
		[5, 0.02],
	]);
	expect(kinds(jobs)).toEqual(["partial", "final", "clear"]);
});

test("resampling keeps the length and shape of a stream split into odd chunks", () => {
	const rate = 44_100;
	const input = new Float32Array(rate);
	for (let n = 0; n < input.length; n++) input[n] = Math.sin((2 * Math.PI * 440 * n) / rate);

	const resampler = new Resampler(rate);
	const parts: Float32Array[] = [];
	for (let offset = 0; offset < input.length; offset += 777) {
		parts.push(resampler.push(input.subarray(offset, offset + 777)));
	}
	const output = Float32Array.from(parts.flatMap((part) => [...part]));

	expect(Math.abs(output.length - SAMPLE_RATE)).toBeLessThanOrEqual(1);
	for (let n = 0; n < output.length; n += 997) {
		expect(output[n]).toBeCloseTo(Math.sin((2 * Math.PI * 440 * n) / SAMPLE_RATE), 1);
	}
});

test("resampling refuses a rate below Whisper's", () => {
	expect(() => new Resampler(8_000)).toThrow();
});

test.each([
	["  hello   world ", "hello world"],
	["[BLANK_AUDIO]", ""],
	["(music)", ""],
	["(laughs) that was funny", "(laughs) that was funny"],
])("tidy %p", (input, expected) => {
	expect(tidy(input)).toBe(expected);
});

test("tidy keeps only the latest words of a long transcript", () => {
	const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
	const text = tidy(words);
	expect(text.length).toBeLessThanOrEqual(161);
	expect(text.startsWith("…word")).toBe(true);
	expect(text.endsWith("word59")).toBe(true);
});

test("split keeps every word of a long transcript, in captions short enough to read", () => {
	const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
	const parts = split(`  ${words.join("  ")} `);
	expect(parts.length).toBe(3);
	for (const part of parts) expect(part.length).toBeLessThanOrEqual(160);
	expect(parts.join(" ")).toBe(words.join(" "));
});

test("split of no words is no captions", () => {
	expect(split("[BLANK_AUDIO]")).toEqual([]);
	expect(split("   ")).toEqual([]);
});
