import * as Token from "@kixelated/moq-token";
import * as Uuid from "uuid";
import { z } from "zod";
import * as Account from "./account";
import * as Auth from "./auth";
import * as rpc from "./rpc";
import { randomAvatar, randomName } from "./shared";

// Room name validation - only allows URL-safe characters
// Alphanumeric, hyphens, underscores, and dots
export const ROOM_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
export const ROOM_NAME_ERROR = "Room names can only contain letters, numbers, hyphens, underscores, and dots";

export const isValidName = (name: string): boolean => {
	return ROOM_NAME_REGEX.test(name);
};

export const nameSchema = z.string().check(z.minLength(1), z.maxLength(100)).refine(isValidName, ROOM_NAME_ERROR);
export type Name = z.infer<typeof nameSchema>;

// TODO: Add proper type for Env.MOQ_JWK in worker-configuration.d.ts if needed

export class Context {
	#key: Token.Key;
	#env: Env;

	constructor(env: Env) {
		this.#key = Token.load(env.RELAY_SECRET);
		this.#env = env;
	}

	// Returns the URL to join the room
	async sign(room: Name, account: string): Promise<URL> {
		const root = `${this.#env.RELAY_PREFIX}/${room}`;
		// TODO add a field to force publishing, preventing someone from lurking.
		const token = await Token.sign(this.#key, { root, get: "", put: account });
		return new URL(`${root}/?jwt=${token}`, this.#env.RELAY_URL);
	}

	// Returns a URL to preview a list of rooms
	async signPreview(rooms: Name[]): Promise<URL> {
		const root = this.#env.RELAY_PREFIX;
		const token = await Token.sign(this.#key, {
			root,
			get: rooms,
			// no put permission
		});
		return new URL(`${root}/?jwt=${token}`, this.#env.RELAY_URL);
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
		rpc.withJson(z.object({ guest: z.lazy(() => Account.infoSchema).optional() })),
		Auth.optional,
		async (c) => {
			const ctx = c.var.ctx;
			const room = c.req.valid("param").room;

			let info: Account.Info;
			if (c.var.account_id) {
				const row = await ctx.account.get(c.var.account_id);
				if (!row) {
					throw new Error("Account not found");
				}

				info = {
					id: c.var.account_id,
					name: row.name,
					avatar: row.avatar,
				};
			} else {
				// Let the client provide it's own info but only if the ID starts with "guest/"
				const guest = c.req.valid("json").guest;
				if (guest?.id.startsWith("guest/")) {
					info = guest;
				} else {
					info = {
						id: Account.idSchema.parse(`guest/${Uuid.v4()}`),
						name: randomName(),
						avatar: randomAvatar(),
					};
				}
			}

			const url = await ctx.room.sign(room, info.id);
			return c.json({ url, info });
		},
	);
