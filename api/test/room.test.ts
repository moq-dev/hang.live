import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";
import * as MoqAuth from "@moq/auth";
import { Hono } from "hono";
import { decodeJwt } from "jose";
import * as Auth from "../src/auth";
import { guestSchema } from "../src/client";
import type RootContext from "../src/context";
import * as Room from "../src/room";
import { env } from "./harness";

// @moq/clock's host clock reads wall time from Date, so pinning it pins token times.
const START = 1_735_689_600;

beforeEach(() => setSystemTime(START * 1000));
afterEach(() => setSystemTime());

async function context() {
	const key = await MoqAuth.Key.generate("HS256");
	const room = new Room.Context({
		RELAY_SECRET: JSON.stringify(key),
		RELAY_PREFIX: "hang",
		RELAY_URL: "https://relay.example",
	});
	return { key, room };
}

// The room routes over a real signer and guest issuer.
async function join() {
	const { key, room } = await context();
	const auth = new Auth.Context(env);
	const app = new Hono<{ Variables: { ctx: RootContext } }>()
		.use(async (c, next) => {
			c.set("ctx", { auth, room } as RootContext);
			await next();
		})
		.route("/room", Room.router);
	const call = (body: object, token?: string) =>
		app.request("/room/friends/join", {
			method: "POST",
			headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
			body: JSON.stringify(body),
		});
	const external = async () => {
		const response = await app.request("/room/friends/external", { method: "POST" });
		expect(response.status).toBe(200);
		return (await response.json()) as External;
	};
	return { key, auth, call, external };
}

type Joined = { url: string; relay: string; token: string; lifetime: number; path: string; guest?: string };
type External = { relay: string; path: string; publish: string; subscribe: string; lifetime: number };

test("join grants publishing only beneath the participant identity", async () => {
	const { key, room } = await context();
	const grant = await room.sign("friends", "guest/alice");
	// The relay refuses a path with an empty segment, so no trailing slash.
	expect(grant.relay.href).toBe("https://relay.example/hang/friends");
	const claims = await MoqAuth.Key.verify(key, grant.token);
	expect(claims.root).toBe("hang/friends");
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").publish.matches("guest/alice/camera")).toBe(true);
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").publish.matches("guest/bob/camera")).toBe(false);
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").subscribe.matches("guest/bob/camera")).toBe(true);
	// Prefixes are written as subtree patterns so released relays read the same grants.
	expect(decodeJwt(grant.token)).toMatchObject({
		root: "hang/friends",
		publish: ["guest/alice/**"],
		subscribe: ["**"],
	});
});

test("room and preview tokens stop working once their lifetime passes", async () => {
	const { key, room } = await context();
	for (const grant of [await room.sign("friends", "guest/alice"), await room.signPreview(["friends"])]) {
		if (!grant) throw new Error("expected a grant");
		expect(grant.lifetime).toBe(Room.LIFETIME);
		expect(decodeJwt(grant.token).exp).toBe(START + Room.LIFETIME);
	}

	const grant = await room.sign("friends", "guest/alice");
	setSystemTime((START + Room.LIFETIME - 1) * 1000);
	await MoqAuth.Key.verify(key, grant.token);
	setSystemTime((START + Room.LIFETIME) * 1000);
	await expect(MoqAuth.Key.verify(key, grant.token)).rejects.toThrow("expired");
});

test("previews subscribe only to the requested rooms and cannot publish", async () => {
	const { key, room } = await context();
	const grant = await room.signPreview(["friends", "work"]);
	if (!grant) throw new Error("expected a grant");
	expect(grant.relay.href).toBe("https://relay.example/hang");
	const permissions = MoqAuth.Claims.authorize(await MoqAuth.Key.verify(key, grant.token), "hang");
	expect(permissions.subscribe.matches("friends/guest/alice/camera")).toBe(true);
	expect(permissions.subscribe.matches("work/guest/bob/camera")).toBe(true);
	expect(permissions.subscribe.matches("other/guest/alice/camera")).toBe(false);
	expect(permissions.publish.matches("friends/guest/alice/camera")).toBe(false);
});

test("no favorites needs no preview grant or relay connection", async () => {
	const { room } = await context();
	expect(await room.signPreview([])).toBeUndefined();
});

test("a guest rejoins as itself only with the credential it was issued", async () => {
	const { key, call } = await join();

	const first = (await (await call({})).json()) as Joined;
	expect(guestSchema.safeParse(first.path).success).toBe(true);
	if (!first.guest) throw new Error("expected a guest credential");
	const claims = await MoqAuth.Key.verify(key, first.token);
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").publish.matches(`${first.path}/camera`)).toBe(true);

	const again = (await (await call({ guest: first.guest })).json()) as Joined;
	expect(again.path).toBe(first.path);
	expect(again.guest).toBe(first.guest);

	// Another guest's path is visible to the whole room, so naming it proves nothing: it joins as a new guest.
	const named = (await (await call({ guest: first.path })).json()) as Joined;
	expect(named.path).not.toBe(first.path);
	expect(guestSchema.safeParse(named.path).success).toBe(true);

	// Tabs open from before renewal dial the token-carrying URL as is.
	expect(first.relay).toBe("https://relay.example/hang/friends");
	expect(first.url).toBe(`https://relay.example/hang/friends?jwt=${first.token}`);
});

test("a forged or borrowed guest credential is refused", async () => {
	const { auth, call } = await join();
	const forged = await new Auth.Context({ AUTH_SECRET: "other-secret" }).createGuest();
	expect((await call({ guest: forged.credential })).status).toBe(401);

	// A session token is signed with the same secret but is no guest credential.
	expect((await call({ guest: await auth.create("guest/alice") })).status).toBe(401);
});

test("a signed-in account joins as itself and gets no guest credential", async () => {
	const { auth, call } = await join();
	const issued = await auth.createGuest();
	const joined = (await (await call({ guest: issued.credential }, await auth.create("account-1"))).json()) as Joined;
	expect(joined.path).toBe("account-1");
	expect(joined.guest).toBeUndefined();
});

test("an external publisher streams only as its fresh identity, capped and expiring", async () => {
	const { key, call, external } = await join();
	const participant = ((await (await call({})).json()) as Joined).path;

	const mint = await external();
	expect(mint.relay).toBe("https://relay.example/hang/friends");
	expect(mint.path).toMatch(/^external\/[0-9a-f-]{36}$/);
	expect(mint.lifetime).toBe(Room.EXTERNAL_LIFETIME);

	const publish = await MoqAuth.Key.verify(key, mint.publish);
	const permissions = MoqAuth.Claims.authorize(publish, "hang/friends");
	expect(permissions.publish.matches(`${mint.path}/camera.hang`)).toBe(true);
	expect(permissions.publish.matches(`${participant}/camera.hang`)).toBe(false);
	expect(permissions.publish.matches("external/other/camera.hang")).toBe(false);
	expect(permissions.subscribe.size).toBe(0);
	expect(decodeJwt(mint.publish)).toMatchObject({
		publish: { path: [`${mint.path}/**`], rate: Room.EXTERNAL_RATE },
		exp: START + Room.EXTERNAL_LIFETIME,
	});

	const egress = MoqAuth.Claims.authorize(await MoqAuth.Key.verify(key, mint.subscribe), "hang/friends");
	expect(egress.subscribe.matches(`${participant}/camera.hang`)).toBe(true);
	expect(egress.publish.size).toBe(0);
	expect(decodeJwt(mint.subscribe).exp).toBe(START + Room.EXTERNAL_LIFETIME);

	// Each mint is a new identity, so one tool can never stream as another.
	expect((await external()).path).not.toBe(mint.path);

	setSystemTime((START + Room.EXTERNAL_LIFETIME) * 1000);
	await expect(MoqAuth.Key.verify(key, mint.publish)).rejects.toThrow("expired");
	await expect(MoqAuth.Key.verify(key, mint.subscribe)).rejects.toThrow("expired");
});

test("guest identities cannot become wildcard grants", () => {
	expect(guestSchema.safeParse("guest/alice").success).toBe(true);
	for (const path of ["guest/", "guest/*", "guest/**", "guest/al*ice", "guest//alice", "account/alice"]) {
		expect(guestSchema.safeParse(path).success).toBe(false);
	}
});

test("signing rejects a wildcard identity even outside the join route", async () => {
	const { room } = await context();
	await expect(room.sign("friends", "guest/**")).rejects.toThrow();
});
