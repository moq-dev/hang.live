// Helpers to make Hono RPC a little bit easier.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { z } from "zod/mini";
import Context from "./context";

export function app() {
	return new Hono<{
		Bindings: Context;
	}>()
		.use(withContext)
		.use(withCors);
}

export function router() {
	return new Hono<{
		Bindings: Context;
		Variables: {
			ctx: Context;
		};
	}>();
}

// Instead of exposing env directly, we wrap it in a context object for easier access
export const withContext = createMiddleware<{
	Bindings: Env;
	Variables: {
		ctx: Context;
	};
}>(async (c, next) => {
	const ctx = new Context(c.env);
	c.set("ctx", ctx);
	return await next();
});

export const withCors = cors({
	origin: (origin) => {
		// Allow localhost and tauri.localhost for development
		// TODO Use env.FRONTEND_URL
		if (origin?.includes("localhost") || origin?.includes("tauri.localhost")) {
			return origin;
		}
		// In production, you'd want to check against your actual frontend URL
		return origin || "";
	},
	allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowHeaders: ["Content-Type", "Authorization"],
	credentials: true,
});

export function withForm<T extends z.ZodMiniType>(schema: T) {
	return zValidator("form", schema);
}

export function withJson<T extends z.ZodMiniType>(schema: T) {
	return zValidator("json", schema);
}

export function withQuery<T extends z.ZodMiniType>(schema: T) {
	return zValidator("query", schema);
}

export function withParam<T extends z.ZodMiniType>(schema: T) {
	return zValidator("param", schema);
}
