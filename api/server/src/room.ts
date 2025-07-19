import * as Token from "@kixelated/moq-token";
import * as Uuid from "uuid";
import { z } from "zod/mini";
import * as Account from "./account";
import * as Auth from "./auth";
import * as rpc from "./rpc";

export const nameSchema = z.string().check(z.minLength(1), z.maxLength(100));
export type Name = z.infer<typeof nameSchema>;

// TODO: Add proper type for Env.MOQ_JWK in worker-configuration.d.ts if needed

export class Context {
	#key?: Token.Key;
	#env: Env;

	constructor(env: Env) {
		this.#key = env.RELAY_SECRET ? Token.load(env.RELAY_SECRET) : undefined;
		this.#env = env;
	}

	// Returns the URL to join the room
	async sign(room: Name, account: Account.Id): Promise<URL> {
		let path = `${room}/`;
		if (this.#env.RELAY_PREFIX) {
			path = `${this.#env.RELAY_PREFIX}/${path}`;
		}

		if (!this.#key) {
			return new URL(path, this.#env.RELAY_URL);
		}

		const token = await Token.sign(this.#key, { path, sub: "", pub: `${account}/` });
		return new URL(`${path}?jwt=${token}`, this.#env.RELAY_URL);
	}
}

export const joinSchema = z.object({
	name: nameSchema,
});

export const router = rpc
	.router()
	.post("/:name/join", rpc.withParam(z.object({ name: nameSchema })), Auth.optional, async (c) => {
		const ctx = c.var.ctx;
		const room = c.req.valid("param").name;

		// Generate a random account ID if not authenticated
		const account = c.var.account_id ?? Account.idSchema.parse(Uuid.v4());

		const url = await ctx.room.sign(room, account);
		return c.json({ url });
	});
