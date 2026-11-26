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

test("renewals that keep failing throw once the token expired, without a burst", async () => {
	const { calls, sign } = signer([
		{ token: "a", lifetime: 600 },
		...Array.from({ length: 100 }, () => new Error("offline")),
	]);
	const grants = renew(sign, new AbortController().signal);
	await grants.next();
	let error: unknown;
	try {
		await clock.drive(grants.next());
	} catch (err) {
		error = err;
	}
	expect(error).toEqual(new Error("offline"));
	expect(calls.at(-1)).toBeGreaterThanOrEqual(600);
	// Halving what remains, floored at a second: 540, 570, 585, ... then once a second at the end.
	expect(calls.length).toBeLessThan(15);
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
