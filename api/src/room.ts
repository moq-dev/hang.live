import * as Token from "@moq/token";
import * as Uuid from "uuid";
import { z } from "zod";
import * as Auth from "./auth";
import { isValidRoom, ROOM_NAME_ERROR } from "./client";
import * as rpc from "./rpc";

export const nameSchema = z.string().check(z.minLength(1), z.maxLength(100)).refine(isValidRoom, ROOM_NAME_ERROR);
export type Name = z.infer<typeof nameSchema>;

// TODO: Add proper type for Env.MOQ_JWK in worker-configuration.d.ts if needed

export class Context {
	#key: Token.Key;
	#env: Env;

	constructor(env: Env) {
		this.#key = Token.load(env.RELAY_SECRET);
		this.#env = env;
	}
	// Returns the path/token to join the room
	async sign(room: Name): Promise<string> {
		const root = `${this.#env.RELAY_PREFIX}/${room}`;
		// TODO add a field to force publishing, preventing someone from lurking.
		const token = await Token.sign(this.#key, { root, get: "", put: "" });
		return `${root}/?jwt=${token}`;
	}

	// Returns a URL to preview a list of rooms
	async signPreview(rooms: Name[]): Promise<string> {
		const root = this.#env.RELAY_PREFIX;
		const token = await Token.sign(this.#key, {
			root,
			get: rooms,
			// no put permission
		});
		return `${root}/?jwt=${token}`;
	}
}

export const joinSchema = z.object({
	name: nameSchema,
});

export const router = rpc
	.router()
	.post(
		"/:room/join",
		rpc.withParam(z.object({ room: nameSchema })),
		rpc.withJson(z.object({ guest: z.string().startsWith("guest/").optional() })),
		Auth.optional,
		async (c) => {
			const ctx = c.var.ctx;
			const room = c.req.valid("param").room;
			const path = c.var.account_id ?? c.req.valid("json").guest ?? `guest/${Uuid.v4()}`;
			const token = await ctx.room.sign(room);
			const url = new URL(token, ctx.env.RELAY_URL);
			return c.json({ url, path, guest: !c.var.account_id ? path : undefined });
		},
	);
