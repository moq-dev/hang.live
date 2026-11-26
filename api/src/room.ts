import * as MoqAuth from "@moq/auth";
import { wall } from "@moq/clock";
import { z } from "zod";
import * as Auth from "./auth";
import { guestTokenSchema, isValidRoom, ROOM_NAME_ERROR } from "./client";
import * as rpc from "./rpc";

export const nameSchema = z.string().check(z.minLength(1), z.maxLength(100)).refine(isValidRoom, ROOM_NAME_ERROR);
export type Name = z.infer<typeof nameSchema>;

// Seconds a room or preview token admits its holder; the app renews it before then.
// Long, because a session on moq-lite before 07 can only take a renewed token by redialing.
export const LIFETIME = 2 * 60 * 60;

// A relay URL and the token that admits its holder there for `lifetime` seconds.
export interface Grant {
	url: URL;
	token: string;
	lifetime: number;
}

type Relay = Record<"RELAY_SECRET" | "RELAY_PREFIX" | "RELAY_URL", string>;

export class Context {
	#key: MoqAuth.Key;
	#env: Relay;

	constructor(env: Relay) {
		this.#key = MoqAuth.Key.parse(env.RELAY_SECRET);
		this.#env = env;
	}

	// Grants watching the whole room and publishing only beneath `identity`.
	async sign(room: Name, identity: string): Promise<Grant> {
		// Each grant is a prefix covering its path and everything beneath; "" is the whole room.
		return await this.#grant(`${this.#env.RELAY_PREFIX}/${room}`, { subscribe: [""], publish: [identity] });
	}

	// Grants watching the listed rooms without publishing, or undefined for none.
	async signPreview(rooms: Name[]): Promise<Grant | undefined> {
		if (rooms.length === 0) return undefined;
		return await this.#grant(this.#env.RELAY_PREFIX, { subscribe: rooms });
	}

	async #grant(root: string, grants: { subscribe: string[]; publish?: string[] }): Promise<Grant> {
		const expires = Math.floor(wall().asUnixMillis() / 1000) + LIFETIME;
		const token = await MoqAuth.Key.sign(this.#key, { root, ...grants, expires });
		// The token rides apart from the URL, so the app can replace it without redialing.
		return { url: new URL(root, this.#env.RELAY_URL), token, lifetime: LIFETIME };
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
		rpc.withJson(z.object({ guest: guestTokenSchema.optional() })),
		Auth.optional,
		async (c) => {
			const ctx = c.var.ctx;
			const room = c.req.valid("param").room;
			const credential = c.req.valid("json").guest;

			let path: string;
			let guest: string | undefined;
			if (c.var.account_id) {
				path = c.var.account_id;
			} else if (credential) {
				// Guest paths are public to the room, so only the credential the API issued proves one.
				const verified = await ctx.auth.verifyGuest(credential);
				if (!verified) return c.text("Invalid guest credential", 401);
				path = verified;
				guest = credential;
			} else {
				({ path, credential: guest } = await ctx.auth.createGuest());
			}

			const grant = await ctx.room.sign(room, path);
			return c.json({ ...grant, path, guest });
		},
	);
