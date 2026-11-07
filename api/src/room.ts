import * as MoqAuth from "@moq/auth";
import * as Uuid from "uuid";
import { z } from "zod";
import * as Auth from "./auth";
import { guestSchema, isValidRoom, ROOM_NAME_ERROR } from "./client";
import * as rpc from "./rpc";

export const nameSchema = z.string().check(z.minLength(1), z.maxLength(100)).refine(isValidRoom, ROOM_NAME_ERROR);
export type Name = z.infer<typeof nameSchema>;

export class Context {
	#key: MoqAuth.Key;
	#env: Pick<Env, "RELAY_SECRET" | "RELAY_PREFIX">;

	constructor(env: Pick<Env, "RELAY_SECRET" | "RELAY_PREFIX">) {
		this.#key = MoqAuth.Key.parse(env.RELAY_SECRET);
		this.#env = env;
	}
	// Returns the path/token to join the room
	async sign(room: Name, identity: string): Promise<string> {
		const root = `${this.#env.RELAY_PREFIX}/${room}`;
		const publish = [MoqAuth.Pattern.subtree(identity).text];
		const token = await MoqAuth.Key.sign(this.#key, { root, subscribe: ["**"], publish });
		return `${root}/?jwt=${token}`;
	}

	// Returns a URL to preview a list of rooms
	async signPreview(rooms: Name[]): Promise<string | undefined> {
		if (rooms.length === 0) return undefined;
		const root = this.#env.RELAY_PREFIX;
		const token = await MoqAuth.Key.sign(this.#key, {
			root,
			subscribe: rooms.map((room) => MoqAuth.Pattern.subtree(room).text),
			// Preview tokens grant no publishing permission.
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
		rpc.withJson(z.object({ guest: guestSchema.optional() })),
		Auth.optional,
		async (c) => {
			const ctx = c.var.ctx;
			const room = c.req.valid("param").room;
			const path = c.var.account_id ?? c.req.valid("json").guest ?? `guest/${Uuid.v4()}`;
			const token = await ctx.room.sign(room, path);
			const url = new URL(token, ctx.env.RELAY_URL);
			return c.json({ url, path, guest: !c.var.account_id ? path : undefined });
		},
	);
