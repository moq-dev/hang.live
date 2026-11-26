import { afterEach, beforeEach, expect, test } from "bun:test";
import * as Clock from "@moq/clock";
import { Manual } from "@moq/clock/test";
import { renew } from "./relay";

let clock: Manual;
let installed: Clock.Installed;

beforeEach(() => {
	clock = new Manual();
	installed = clock.install();
});

afterEach(() => installed.close());

type Grant = { token: string; lifetime?: number };

// A signer answering from `script` in order, recording the second each call came at.
function signer(script: (Grant | Error)[]) {
	const calls: number[] = [];
	const sign = async () => {
		calls.push(Clock.now().since(Clock.Instant.ZERO).asSecs());
		const next = script.shift();
		if (!next) throw new Error("unscripted sign");
		if (next instanceof Error) throw next;
		return next;
	};
	return { calls, sign };
}

test("renews once a tenth of each token's lifetime remains", async () => {
	const { calls, sign } = signer([
		{ token: "a", lifetime: 600 },
		{ token: "b", lifetime: 600 },
		{ token: "c", lifetime: 100 },
		{ token: "d", lifetime: 100 },
	]);
	const grants = renew(sign, new AbortController().signal);
	const tokens = [];
	for (let i = 0; i < 4; i++) tokens.push((await clock.drive(grants.next())).value?.token);
	expect(tokens).toEqual(["a", "b", "c", "d"]);
	expect(calls).toEqual([0, 540, 1080, 1170]);
});

test("a failed renewal retries while the token still works", async () => {
	const { calls, sign } = signer([
		{ token: "a", lifetime: 600 },
		new Error("offline"),
		{ token: "b", lifetime: 600 },
	]);
	const grants = renew(sign, new AbortController().signal);
	await grants.next();
	expect((await clock.drive(grants.next())).value?.token).toBe("b");
	expect(calls).toEqual([0, 540, 570]);
});

test("renewals outlasting the token back off until the API answers again", async () => {
	const { calls, sign } = signer([
		{ token: "a", lifetime: 600 },
		...Array.from({ length: 20 }, () => new Error("offline")),
		{ token: "b", lifetime: 600 },
	]);
	const grants = renew(sign, new AbortController().signal);
	await grants.next();
	expect((await clock.drive(grants.next())).value?.token).toBe("b");

	// Halving what remains, floored at a second, then doubling since expiry: no burst either side.
	const before = calls.filter((at) => at < 600);
	expect(before.slice(0, 3)).toEqual([0, 540, 570]);
	expect(before.length).toBeLessThan(10);
	const after = calls.filter((at) => at >= 600);
	const gaps = after.slice(1).map((at, i) => at - (after[i] ?? 0));
	for (const [i, gap] of gaps.entries()) {
		expect(gap).toBeGreaterThanOrEqual(1);
		expect(gap).toBeLessThanOrEqual(60);
		if (i > 0) expect(gap).toBeGreaterThanOrEqual(gaps[i - 1] ?? 0);
	}
	expect(gaps.at(-1)).toBe(60);
});

test("the first sign failing throws at once", async () => {
	const { sign } = signer([new Error("forbidden")]);
	expect(renew(sign, new AbortController().signal).next()).rejects.toThrow("forbidden");
});

test("a grant without a lifetime needs no renewal", async () => {
	const { calls, sign } = signer([{ token: "a" }]);
	const grants = renew(sign, new AbortController().signal);
	expect((await grants.next()).value?.token).toBe("a");
	expect((await grants.next()).done).toBe(true);
	expect(calls).toEqual([0]);
});

test("aborting stops the renewals", async () => {
	const { calls, sign } = signer([{ token: "a", lifetime: 600 }]);
	const abort = new AbortController();
	const grants = renew(sign, abort.signal);
	await grants.next();
	const next = grants.next();
	await clock.advance(Clock.Duration.secs(100));
	abort.abort();
	expect((await next).done).toBe(true);
	expect(calls).toEqual([0]);
});
