import { afterEach, expect, setSystemTime, test } from "bun:test";
import { Hono } from "hono";
import * as jose from "jose";
import * as Auth from "../src/auth";
import type RootContext from "../src/context";
import { env } from "./harness";

const auth = new Auth.Context(env);

const app = new Hono<{ Variables: { ctx: RootContext } }>()
	.use(async (c, next) => {
		c.set("ctx", { auth } as RootContext);
		await next();
	})
	.get("/required", Auth.required, (c) => c.text(c.var.account_id))
	.get("/optional", Auth.optional, (c) => c.text(c.var.account_id ?? "guest"));

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

afterEach(() => {
	setSystemTime();
});

// A real session token whose lifetime has run out, leaving the clock at the time it is checked.
async function expired(): Promise<string> {
	setSystemTime(new Date("2024-01-01T00:00:00Z"));
	const token = await auth.create("someone");
	setSystemTime(new Date("2026-01-01T00:00:00Z"));
	return token;
}

async function forged(): Promise<string> {
	return await new Auth.Context({ AUTH_SECRET: "other-secret" }).create("someone");
}

test("a valid session token authenticates", async () => {
	const token = await auth.create("someone");
	expect(await (await app.request("/required", bearer(token))).text()).toBe("someone");
	expect(await (await app.request("/optional", bearer(token))).text()).toBe("someone");
});

test("bad tokens are unauthorized on required routes, not server errors", async () => {
	for (const token of ["garbage", "a.b.c", await expired(), await forged()]) {
		expect(await auth.verify(token)).toBeUndefined();
		expect((await app.request("/required", bearer(token))).status).toBe(401);
	}
});

test("bad tokens fall back to a guest on optional routes", async () => {
	// A stale token in a returning browser must not stop it joining a room as a guest.
	for (const token of ["garbage", await expired(), await forged()]) {
		const res = await app.request("/optional", bearer(token));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("guest");
	}
});

test("a session token works for a year and no longer", async () => {
	const minted = Date.parse("2026-01-01T00:00:00Z");
	const year = 365 * 24 * 60 * 60 * 1000;
	setSystemTime(minted);
	const token = await auth.create("someone");

	setSystemTime(minted + year - 1000);
	expect((await app.request("/required", bearer(token))).status).toBe(200);
	setSystemTime(minted + year);
	expect((await app.request("/required", bearer(token))).status).toBe(401);
});

test("tokens signed with another algorithm are refused", async () => {
	const unsigned = new jose.UnsecuredJWT({ sub: "someone", iat: 0, exp: 4e9 }).encode();
	expect(await auth.verify(unsigned)).toBeUndefined();
});
