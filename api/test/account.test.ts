import { Database } from "bun:sqlite";
import { afterEach, expect, setSystemTime, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Hono } from "hono";
import * as Account from "../src/account";
import type RootContext from "../src/context";
import * as Fave from "../src/fave";
import * as Storage from "../src/storage";

// Run the real queries against the real migrations, with D1's foreign key enforcement.
function database() {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const dir = join(import.meta.dir, "../migrations");
	for (const file of readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		sqlite.exec(readFileSync(join(dir, file), "utf8"));
	}
	// Both drivers share Drizzle's SQLite query builders; only the result mode differs.
	return { sqlite, db: drizzle(sqlite) as unknown as Account.Context["db"] };
}

// An in-memory R2 bucket that records what the code stores.
function bucket() {
	const objects = new Map<string, Uint8Array>();
	const r2 = {
		put: async (key: string, value: Uint8Array) => {
			objects.set(key, value);
		},
		get: async (key: string) => {
			const value = objects.get(key);
			return value ? { arrayBuffer: async () => value.buffer } : null;
		},
		delete: async (key: string) => {
			objects.delete(key);
		},
	};
	return { objects, r2 };
}

function setup() {
	const { sqlite, db } = database();
	const { objects, r2 } = bucket();
	const env = { R2_PUBLIC_URL: "https://r2.example", PUBLIC: r2 } as unknown as Env;
	const storage = new Storage.Context(env);
	const account = new Account.Context(env, db, storage);
	return { sqlite, db, objects, account };
}

function png(size = 4): File {
	return new File([new Uint8Array(size)], "me.png", { type: "image/png" });
}

afterEach(() => {
	setSystemTime();
});

test("accounts without a provider avatar get a working random avatar URL", async () => {
	const { account } = setup();
	const info = await account.create({ name: "Alice", email: "alice@example.com" });
	expect(info.avatar).toMatch(/^\/avatar\/\d+\.svg$/);
});

test("replacing an uploaded avatar uploads first, then deletes the old object and bumps updatedAt", async () => {
	const { account, objects, sqlite } = setup();
	setSystemTime(new Date("2026-01-01T00:00:00Z"));
	const { id } = await account.create({ name: "Alice", email: "alice@example.com" });

	const first = await account.update(id, { avatar: png() });
	const firstKey = [...objects.keys()];
	expect(firstKey).toHaveLength(1);
	expect(first.avatar).toBe(`https://r2.example/${firstKey[0]}`);

	setSystemTime(new Date("2026-02-01T00:00:00Z"));
	const second = await account.update(id, { avatar: png() });
	const secondKey = [...objects.keys()];
	expect(secondKey).toHaveLength(1);
	expect(secondKey[0]).not.toBe(firstKey[0]);
	expect(second.avatar).toBe(`https://r2.example/${secondKey[0]}`);

	const row = sqlite.query("SELECT updated_at FROM accounts WHERE id = ?").get(id) as { updated_at: number };
	expect(row.updated_at).toBe(Date.parse("2026-02-01T00:00:00Z") / 1000);
});

test("a rejected avatar keeps the existing upload", async () => {
	const { account, objects } = setup();
	const { id } = await account.create({ name: "Alice", email: "alice@example.com" });
	const before = await account.update(id, { avatar: png() });

	await expect(account.update(id, { avatar: png(6 * 1024 * 1024) })).rejects.toThrow("too large");
	expect(objects.size).toBe(1);
	expect((await account.get(id))?.avatar).toBe(before.avatar);
});

test("switching to a URL avatar deletes the old upload, but renaming keeps it", async () => {
	const { account, objects } = setup();
	const { id } = await account.create({ name: "Alice", email: "alice@example.com" });
	await account.update(id, { avatar: png() });

	await account.update(id, { name: "Alicia" });
	expect(objects.size).toBe(1);

	const info = await account.update(id, { avatar: "/avatar/3.svg" });
	expect(info.avatar).toBe("/avatar/3.svg");
	expect(objects.size).toBe(0);
});

test("deleting an account removes its favorites and upload", async () => {
	const { account, objects, sqlite } = setup();
	const alice = await account.create({ name: "Alice", email: "alice@example.com" });
	const bob = await account.create({ name: "Bobby", email: "bob@example.com" });
	await account.update(alice.id, { avatar: png() });
	sqlite.exec(`INSERT INTO favorites (account_id, room) VALUES ('${alice.id}', 'a'), ('${bob.id}', 'b')`);

	await account.delete(alice.id);
	expect(await account.get(alice.id)).toBeUndefined();
	expect(objects.size).toBe(0);
	expect(sqlite.query("SELECT account_id FROM favorites").all()).toEqual([{ account_id: bob.id }]);
});

test("favorites add idempotently, list newest first, and remove", async () => {
	const { account, db, sqlite } = setup();
	const { id } = await account.create({ name: "Alice", email: "alice@example.com" });

	// Skip auth and relay signing; only the favorites queries are under test.
	const ctx = {
		db,
		env: { RELAY_URL: "https://relay.example" },
		auth: { verify: async () => ({ sub: id }) },
		room: { signPreview: async (rooms: string[]) => (rooms.length ? `hang?rooms=${rooms.join(",")}` : undefined) },
	} as unknown as RootContext;
	const app = new Hono<{ Variables: { ctx: RootContext } }>()
		.use(async (c, next) => {
			c.set("ctx", ctx);
			await next();
		})
		.route("/fave", Fave.router);
	const call = (method: string, path: string) =>
		app.request(path, { method, headers: { Authorization: "Bearer token" } });
	type All = { favorites: Fave.Info[]; url?: string };

	expect((await call("POST", "/fave/old/add")).status).toBe(200);
	sqlite.exec("UPDATE favorites SET created_at = 1");
	expect((await call("POST", "/fave/new/add")).status).toBe(200);
	expect((await call("POST", "/fave/new/add")).status).toBe(200);

	const all = (await (await call("GET", "/fave/all")).json()) as All;
	expect(all.favorites.map((f) => f.room)).toEqual(["new", "old"]);
	expect(all.favorites[1]?.created_at).toBe(1);
	expect(all.url).toBe("https://relay.example/hang?rooms=new,old");

	expect(await (await call("GET", "/fave/old")).json()).toEqual({ is_favorite: true });
	expect((await call("POST", "/fave/old/remove")).status).toBe(200);
	expect(await (await call("GET", "/fave/old")).json()).toEqual({ is_favorite: false });

	// Another account's favorites stay out of this account's list.
	sqlite.exec("INSERT INTO accounts (id, email, name, avatar) VALUES ('other', 'o@example.com', 'Other', 'x')");
	sqlite.exec("INSERT INTO favorites (account_id, room) VALUES ('other', 'secret')");
	const mine = (await (await call("GET", "/fave/all")).json()) as All;
	expect(mine.favorites.map((f) => f.room)).toEqual(["new"]);
});
