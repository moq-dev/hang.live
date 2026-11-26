import { expect, test } from "bun:test";
import { Hono } from "hono";
import * as jose from "jose";
import * as Auth from "../src/auth";
import type RootContext from "../src/context";
import { env } from "./harness";

const auth = new Auth.Context(env);
const secret = new TextEncoder().encode(env.AUTH_SECRET);

const app = new Hono<{ Variables: { ctx: RootContext } }>()
	.use(async (c, next) => {
		c.set("ctx", { auth } as RootContext);
		await next();
	})
	.get("/required", Auth.required, (c) => c.text(c.var.account_id))
	.get("/optional", Auth.optional, (c) => c.text(c.var.account_id ?? "guest"));

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

async function expired(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return await new jose.SignJWT({ sub: "someone", iat: now - 120, exp: now - 60 })
		.setProtectedHeader({ alg: "HS256" })
		.sign(secret);
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

test("tokens signed with another algorithm are refused", async () => {
	const unsigned = new jose.UnsecuredJWT({ sub: "someone", iat: 0, exp: 4e9 }).encode();
	expect(await auth.verify(unsigned)).toBeUndefined();
});
