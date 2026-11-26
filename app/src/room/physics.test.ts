import { afterEach, beforeEach, expect, test } from "bun:test";
import * as Clock from "@moq/clock";
import { Manual } from "@moq/clock/test";
import { Bounds, Vector } from "./geometry";
import { Deform, repel, STEP, Stepper } from "./physics";

let clock: Manual;
let installed: Clock.Installed;

beforeEach(() => {
	clock = new Manual();
	installed = clock.install();
});

afterEach(() => installed.close());

const square = (x: number, y: number, size = 100) => new Bounds(Vector.create(x, y), Vector.create(size, size));

test("a zero vector normalizes to zero instead of NaN", () => {
	const zero = Vector.create(0, 0).normalize();
	expect(zero).toEqual(Vector.create(0, 0));
	expect(Vector.create(3, 4).normalize()).toEqual(Vector.create(0.6, 0.8));
});

test("the stepper runs one step per elapsed period at any frame rate", () => {
	const stepper = new Stepper();
	expect(stepper.advance()).toBe(0);

	// A 120Hz frame is half a step, so steps land on every other frame.
	const counts = [];
	for (let i = 0; i < 4; i++) {
		clock.jump(STEP.div(2));
		counts.push(stepper.advance());
	}
	expect(counts).toEqual([0, 1, 0, 1]);

	// A 30Hz frame runs two steps.
	clock.jump(STEP.mul(2));
	expect(stepper.advance()).toBe(2);
});

test("the stepper drops a backlog instead of catching up after a stall", () => {
	const stepper = new Stepper();
	stepper.advance();

	clock.jump(Clock.Duration.secs(10));
	expect(stepper.advance()).toBe(4);

	// Nothing carries over from the stall.
	clock.jump(STEP.div(2));
	expect(stepper.advance()).toBe(0);
});

test("overlapping tiles push apart along their centers, and separate tiles don't", () => {
	const force = repel(square(0, 0), square(50, 0));
	expect(force?.x).toBeLessThan(0);
	expect(force?.y).toBe(0);

	expect(repel(square(0, 0), square(100, 0))).toBeUndefined();
});

test("tiles with identical centers still push apart", () => {
	// A small tile centered on a larger one overlaps a fifth of their combined area, twice over.
	expect(repel(square(25, 25, 50), square(0, 0))).toEqual(Vector.create(0.4, 0));
});

test("wobble decays to exactly rest and leaves the subdivided mesh", () => {
	const deform = new Deform();
	deform.velocity = Vector.create(30, -40);
	deform.zoom = -2;
	expect(deform.active).toBe(true);

	let steps = 0;
	while (deform.velocity.length() > 0 || deform.zoom !== 0) {
		deform.step();
		steps++;
		expect(steps).toBeLessThan(100);
	}

	expect(deform.active).toBe(false);
	expect(deform.velocity).toEqual(Vector.create(0, 0));
	expect(deform.zoom).toBe(0);
});
