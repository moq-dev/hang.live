// Helpers to make Hono RPC a little bit easier.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import type Context from "./context";

// A router whose handlers see the Worker's env and the request's context.
export function router() {
	return new Hono<{
		Bindings: Env;
		Variables: {
			ctx: Context;
		};
	}>();
}

// Allows credentialed requests from the app's origin only.
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

// Validates the form body against `schema`.
export function withForm<T extends z.ZodType>(schema: T) {
	return zValidator("form", schema);
}

// Validates the JSON body against `schema`.
export function withJson<T extends z.ZodType>(schema: T) {
	return zValidator("json", schema);
}

// Validates the query string against `schema`.
export function withQuery<T extends z.ZodType>(schema: T) {
	return zValidator("query", schema);
}

// Validates the path parameters against `schema`.
export function withParam<T extends z.ZodType>(schema: T) {
	return zValidator("param", schema);
}
