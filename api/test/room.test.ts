import { expect, test } from "bun:test";
import * as MoqAuth from "@moq/auth";
import { decodeJwt } from "jose";
import { guestSchema } from "../src/client";
import { Context } from "../src/room";

async function context() {
	const key = await MoqAuth.Key.generate("HS256");
	return { key, room: new Context({ RELAY_SECRET: JSON.stringify(key), RELAY_PREFIX: "hang" }) };
}

function jwt(path: string | undefined): string {
	if (!path) throw new Error("Missing relay path");
	const token = new URL(path, "https://relay.example/").searchParams.get("jwt");
	if (!token) throw new Error("Missing room token");
	return token;
}

test("join grants publishing only beneath the participant identity", async () => {
	const { key, room } = await context();
	const path = await room.sign("friends", "guest/alice");
	// The relay refuses a path with an empty segment, so no trailing slash.
	expect(path).toStartWith("hang/friends?jwt=");
	const token = jwt(path);
	const claims = await MoqAuth.Key.verify(key, token);
	expect(claims.root).toBe("hang/friends");
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").publish.matches("guest/alice/camera")).toBe(true);
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").publish.matches("guest/bob/camera")).toBe(false);
	expect(MoqAuth.Claims.authorize(claims, "hang/friends").subscribe.matches("guest/bob/camera")).toBe(true);
	// Prefixes are written as subtree patterns so released relays read the same grants.
	expect(decodeJwt(token)).toMatchObject({ root: "hang/friends", publish: ["guest/alice/**"], subscribe: ["**"] });
});

test("previews subscribe only to the requested rooms and cannot publish", async () => {
	const { key, room } = await context();
	const path = await room.signPreview(["friends", "work"]);
	expect(path).toStartWith("hang?jwt=");
	const token = jwt(path);
	const permissions = MoqAuth.Claims.authorize(await MoqAuth.Key.verify(key, token), "hang");
	expect(permissions.subscribe.matches("friends/guest/alice/camera")).toBe(true);
	expect(permissions.subscribe.matches("work/guest/bob/camera")).toBe(true);
	expect(permissions.subscribe.matches("other/guest/alice/camera")).toBe(false);
	expect(permissions.publish.matches("friends/guest/alice/camera")).toBe(false);
});

test("no favorites needs no preview grant or relay connection", async () => {
	const { room } = await context();
	expect(await room.signPreview([])).toBeUndefined();
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
