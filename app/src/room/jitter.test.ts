import { expect, test } from "bun:test";
import { Jitter } from "./jitter";

// The publisher's media clock and our wall clock never share an origin.
const OFFSET = 1_700_000_000_000;

// Feed 20ms frames from `start` for `count` frames, each `delay(i)` late, then sample at the last arrival.
function frames(jitter: Jitter, start: number, count: number, delay: (i: number) => number = () => 0) {
	let wall = 0;
	for (let i = 0; i < count; i++) {
		const timestamp = start + i * 20;
		wall = OFFSET + timestamp + delay(i);
		jitter.arrive(timestamp, wall);
	}
	return jitter.sample(wall);
}

test("reports nothing before any frame arrives", () => {
	expect(new Jitter().sample(OFFSET)).toBeUndefined();
});

test("steady arrivals have no jitter whatever the clock offset", () => {
	const jitter = new Jitter();
	expect(frames(jitter, 0, 10)).toBe(0);
	expect(frames(jitter, 200, 10)).toBe(0);
});

test("a late frame shows its delay over the baseline, then clears", () => {
	const jitter = new Jitter();
	frames(jitter, 0, 10);
	expect(frames(jitter, 200, 10, (i) => (i === 4 ? 35 : 0))).toBe(35);
	expect(frames(jitter, 400, 10)).toBe(0);
});

test("a repeated report of the same arrival is not a new frame", () => {
	const jitter = new Jitter();
	frames(jitter, 0, 10);
	jitter.arrive(500, OFFSET + 500);
	// The same frame again, as reported when another counter moved, with a later read of the clock.
	jitter.arrive(500, OFFSET + 900);
	expect(jitter.sample(OFFSET + 900)).toBe(0);
});

test("an interval without arrivals ramps with the gap", () => {
	const jitter = new Jitter();
	frames(jitter, 0, 10);
	const last = OFFSET + 180;
	expect(jitter.sample(last + 250)).toBe(250);
	expect(jitter.sample(last + 500)).toBe(500);
	// Recovery: the burst after the gap arrives at once, the oldest frame latest.
	for (let i = 1; i <= 25; i++) jitter.arrive(180 + i * 20, last + 520);
	expect(jitter.sample(last + 520)).toBe(500);
	expect(frames(jitter, 700, 10)).toBe(0);
});

test("a timeline that restarts takes a new baseline instead of spiking", () => {
	const jitter = new Jitter();
	frames(jitter, 50_000, 10);
	// The publisher restarted its clock near zero while ours ran on, so every offset jumped by 50 seconds.
	expect(frames(jitter, 0, 10, () => 50_200)).toBe(0);
});

test("the baseline follows a lasting rise in delay once the old floor leaves the window", () => {
	const jitter = new Jitter();
	frames(jitter, 0, 10);
	let start = 200;
	let last: number | undefined;
	// Every frame now arrives 40ms later than before, for the window and one interval more.
	for (let i = 0; i < 121; i++, start += 200) last = frames(jitter, start, 10, () => 40);
	expect(last).toBe(0);
});
