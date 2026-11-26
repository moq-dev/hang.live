import { Database as Sqlite } from "bun:sqlite";
import { afterEach, expect, setSystemTime, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import type RootContext from "../src/context";
import * as Fave from "../src/fave";
import { harness } from "./harness";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function png(): File {
	return new File([PNG], "me.png", { type: "image/png" });
}

afterEach(() => {
	setSystemTime();
});

test("accounts without a provider avatar get a working random avatar URL", async () => {
	const { ctx } = harness();
	const info = await ctx.account.create({ name: "Alice", email: "alice@example.com" });
	expect(info.avatar).toMatch(/^\/avatar\/\d+\.svg$/);
});

test("the repair migration turns stored random avatars into URLs and leaves uploads alone", () => {
	const sqlite = new Sqlite(":memory:");
	const dir = new URL("../migrations/", import.meta.url).pathname;
	const files = readdirSync(dir)
		.filter((file) => file.endsWith(".sql"))
		.sort();
	const run = (file: string) => sqlite.exec(readFileSync(`${dir}${file}`, "utf8"));
	for (const file of files.filter((file) => file < "0005")) run(file);

	sqlite.exec(`INSERT INTO accounts (id, email, name, avatar, avatar_type) VALUES
		('random', 'a@example.com', 'Alice', '/avatar/3.svg', 'r2'),
		('upload', 'b@example.com', 'Bobby', 'f00.png', 'r2')`);
	for (const file of files.filter((file) => file >= "0005")) run(file);

	expect(sqlite.query("SELECT id, avatar_type FROM accounts ORDER BY id").all()).toEqual([
		{ id: "random", avatar_type: "url" },
		{ id: "upload", avatar_type: "r2" },
	]);
});

test("updating the avatar bumps updatedAt", async () => {
	const { ctx, sqlite } = harness();
	setSystemTime(new Date("2026-01-01T00:00:00Z"));
	const { id } = await ctx.account.create({ name: "Alice", email: "alice@example.com" });

	setSystemTime(new Date("2026-02-01T00:00:00Z"));
	await ctx.account.update(id, { avatar: png() });

	const row = sqlite.query("SELECT updated_at FROM accounts WHERE id = ?").get(id) as { updated_at: number };
	expect(row.updated_at).toBe(Date.parse("2026-02-01T00:00:00Z") / 1000);
});

test("a failed delete of the replaced upload still reports the committed save", async () => {
	const { ctx, bucket } = harness();
	const { id } = await ctx.account.create({ name: "Alice", email: "alice@example.com" });
	await ctx.account.update(id, { avatar: png() });

	const remove = bucket.delete;
	bucket.delete = async () => {
		throw new Error("R2 unavailable");
	};
	const info = await ctx.account.update(id, { avatar: png() });
	bucket.delete = remove;

	expect((await ctx.account.get(id))?.avatar).toBe(info.avatar);
	expect(bucket.objects.size).toBe(2);
});

test("an upload for an account deleted meanwhile is removed, not orphaned", async () => {
	const { ctx, bucket } = harness();
	const { id } = await ctx.account.create({ name: "Alice", email: "alice@example.com" });

	// The account goes while its new avatar is uploading.
	const put = bucket.put.bind(bucket);
	bucket.put = async (...args: Parameters<typeof put>) => {
		await put(...args);
		await ctx.account.delete(id);
	};
	await expect(ctx.account.update(id, { avatar: png() })).rejects.toThrow();
	expect(bucket.objects.size).toBe(0);
});

test("deleting an account removes its favorites and upload, and retries after an R2 failure", async () => {
	const { ctx, bucket, sqlite } = harness();
	const alice = await ctx.account.create({ name: "Alice", email: "alice@example.com" });
	const bob = await ctx.account.create({ name: "Bobby", email: "bob@example.com" });
	await ctx.account.update(alice.id, { avatar: png() });
	sqlite.exec(`INSERT INTO favorites (account_id, room) VALUES ('${alice.id}', 'a'), ('${bob.id}', 'b')`);

	// The row survives a failed R2 delete, so the retry can still find the upload.
	const remove = bucket.delete;
	bucket.delete = async () => {
		throw new Error("R2 unavailable");
	};
	await expect(ctx.account.delete(alice.id)).rejects.toThrow("R2 unavailable");
	bucket.delete = remove;
	expect(await ctx.account.get(alice.id)).toBeDefined();

	await ctx.account.delete(alice.id);
	expect(await ctx.account.get(alice.id)).toBeUndefined();
	expect(bucket.objects.size).toBe(0);
	expect(sqlite.query("SELECT account_id FROM favorites").all()).toEqual([{ account_id: bob.id }]);
});

test("favorites add idempotently, list newest first, and remove", async () => {
	const { ctx: root, sqlite } = harness();
	const { id } = await root.account.create({ name: "Alice", email: "alice@example.com" });

	// Skip auth and relay signing; only the favorites queries are under test.
	const ctx = {
		db: root.db,
		auth: { verify: async () => ({ sub: id }) },
		room: {
			signPreview: async (rooms: string[]) =>
				rooms.length
					? { relay: new URL("https://relay.example/hang"), token: rooms.join(","), lifetime: 600 }
					: undefined,
		},
	} as unknown as RootContext;
	const app = new Hono<{ Variables: { ctx: RootContext } }>()
		.use(async (c, next) => {
			c.set("ctx", ctx);
			await next();
		})
		.route("/fave", Fave.router);
	const call = (method: string, path: string) =>
		app.request(path, { method, headers: { Authorization: "Bearer token" } });
	type All = { favorites: Fave.Info[]; preview?: { token: string }; url?: string };

	expect((await call("POST", "/fave/old/add")).status).toBe(200);
	sqlite.exec("UPDATE favorites SET created_at = 1");
	expect((await call("POST", "/fave/new/add")).status).toBe(200);
	expect((await call("POST", "/fave/new/add")).status).toBe(200);

	const all = (await (await call("GET", "/fave/all")).json()) as All;
	expect(all.favorites.map((f) => f.room)).toEqual(["new", "old"]);
	expect(all.favorites[1]?.created_at).toBe(1);
	expect(all.preview?.token).toBe("new,old");
	expect(all.url).toBe("https://relay.example/hang?jwt=new%2Cold");

	expect(await (await call("GET", "/fave/old")).json()).toEqual({ is_favorite: true });
	expect((await call("POST", "/fave/old/remove")).status).toBe(200);
	expect(await (await call("GET", "/fave/old")).json()).toEqual({ is_favorite: false });

	// Another account's favorites stay out of this account's list.
	sqlite.exec("INSERT INTO accounts (id, email, name, avatar) VALUES ('other', 'o@example.com', 'Other', 'x')");
	sqlite.exec("INSERT INTO favorites (account_id, room) VALUES ('other', 'secret')");
	const mine = (await (await call("GET", "/fave/all")).json()) as All;
	expect(mine.favorites.map((f) => f.room)).toEqual(["new"]);
});
