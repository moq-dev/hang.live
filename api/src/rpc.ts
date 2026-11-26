// Helpers to make Hono RPC a little bit easier.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import type Context from "./context";

export function router() {
	return new Hono<{
		Bindings: Context;
		Variables: {
			ctx: Context;
		};
	}>();
}

export const withCors = createMiddleware<{
	Bindings: Env;
}>(async (c, next) => {
	const corsMiddleware = cors({
		origin: c.env.APP_URL,
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	});

	return corsMiddleware(c, next);
});

export function withForm<T extends z.ZodType>(schema: T) {
	return zValidator("form", schema);
}

export function withJson<T extends z.ZodType>(schema: T) {
	return zValidator("json", schema);
}

export function withQuery<T extends z.ZodType>(schema: T) {
	return zValidator("query", schema);
}

export function withParam<T extends z.ZodType>(schema: T) {
	return zValidator("param", schema);
}
