import { expect, test } from "bun:test";
import { authorize, Key } from "@moq/auth";
import { decodeJwt } from "jose";
import { guestSchema } from "../src/client";
import { Context } from "../src/room";

async function context() {
	const key = await Key.generate("HS256");
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
	const token = jwt(await room.sign("friends", "guest/alice"));
	const claims = await Key.verify(key, token);
	expect(claims.root).toBe("hang/friends");
	expect(authorize(claims, "hang/friends").publish.matches("guest/alice/camera")).toBe(true);
	expect(authorize(claims, "hang/friends").publish.matches("guest/bob/camera")).toBe(false);
	expect(authorize(claims, "hang/friends").subscribe.matches("guest/bob/camera")).toBe(true);
	// Prefix-only grants must still work with the deployed relay's legacy JWT claims.
	expect(decodeJwt(token)).toMatchObject({ root: "hang/friends", put: ["guest/alice"], get: [""] });
});

test("previews subscribe only to the requested rooms and cannot publish", async () => {
	const { key, room } = await context();
	const token = jwt(await room.signPreview(["friends", "work"]));
	const permissions = authorize(await Key.verify(key, token), "hang");
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
