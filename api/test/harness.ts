import { Database as Sqlite } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Hono } from "hono";
import * as Account from "../src/account";
import * as Auth from "../src/auth";
import type RootContext from "../src/context";
import type * as Database from "../src/database";
import * as OAuth from "../src/oauth";
import * as Storage from "../src/storage";

// An in-memory R2 bucket holding only what the API uses.
export class Bucket {
	objects = new Map<string, { data: Uint8Array; contentType?: string }>();

	async put(key: string, data: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
		this.objects.set(key, { data, contentType: options?.httpMetadata?.contentType });
	}

	async get(key: string) {
		const object = this.objects.get(key);
		if (!object) return null;
		return { arrayBuffer: async () => object.data.slice().buffer };
	}

	async delete(key: string) {
		this.objects.delete(key);
	}
}

export const env = {
	AUTH_SECRET: "test-secret",
	API_URL: "https://api.hang.test",
	APP_URL: "https://hang.test",
	R2_PUBLIC_URL: "https://public.hang.test",
	DISCORD_CLIENT_ID: "discord-id",
	DISCORD_CLIENT_SECRET: "discord-secret",
	GOOGLE_CLIENT_ID: "google-id",
	GOOGLE_CLIENT_SECRET: "google-secret",
	APPLE_CLIENT_ID: "apple-id",
	APPLE_CLIENT_SECRET: "",
	APPLE_KEY_ID: "apple-key",
	APPLE_TEAM_ID: "apple-team",
};

// The real routers over a fresh database with every migration applied.
export function harness(overrides: Partial<typeof env> = {}) {
	const sqlite = new Sqlite(":memory:");
	// D1 enforces foreign keys, so cascades behave as in production.
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const dir = new URL("../migrations/", import.meta.url).pathname;
	for (const file of readdirSync(dir)
		.filter((file) => file.endsWith(".sql"))
		.sort()) {
		sqlite.exec(readFileSync(`${dir}${file}`, "utf8"));
	}

	// The query builder matches D1's; only the driver differs.
	const db = drizzle(sqlite) as unknown as Database.Context;
	const bucket = new Bucket();
	const full = { ...env, ...overrides, PUBLIC: bucket } as unknown as Env;
	const storage = new Storage.Context(full);

	const ctx = {
		env: full,
		db,
		storage,
		auth: new Auth.Context(full),
		account: new Account.Context(full, db, storage),
		oauth: new OAuth.Context(full, db),
	} as unknown as RootContext;

	const app = new Hono<{ Variables: { ctx: RootContext } }>()
		.use(async (c, next) => {
			c.set("ctx", ctx);
			await next();
		})
		.route("/auth", OAuth.router)
		.route("/account", Account.router)
		.route("/public", Storage.router);

	return { app, ctx, db, bucket, sqlite };
}

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

// Replace global fetch with the given routes, failing loudly on anything unrouted.
export function mockFetch(...routes: Route[]): { calls: string[]; restore: () => void } {
	const original = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : input.toString());
		calls.push(url.toString());
		for (const route of routes) {
			const res = await route(url, init);
			if (res) return res;
		}
		throw new Error(`unexpected fetch: ${url}`);
	}) as typeof fetch;
	return { calls, restore: () => (globalThis.fetch = original) };
}
