import * as MoqAuth from "@moq/auth";
import { wall } from "@moq/clock";
import { z } from "zod";
import * as Auth from "./auth";
import { guestSchema, guestTokenSchema, isValidRoom, ROOM_NAME_ERROR } from "./client";
import * as rpc from "./rpc";

// Parses a room name: 1 to 100 URL-safe characters.
export const nameSchema = z.string().check(z.minLength(1), z.maxLength(100)).refine(isValidRoom, ROOM_NAME_ERROR);
// A room name that passed `nameSchema`.
export type Name = z.infer<typeof nameSchema>;

// Seconds a room or preview token admits its holder; the app renews it before then.
// Long, because a session on moq-lite before 07 can only take a renewed token by redialing.
export const LIFETIME = 2 * 60 * 60;

// Seconds an external tool's tokens admit it. Longer than LIFETIME, since OBS and the CLI cannot renew and the
// relay ends a session once its token expires, yet short enough that a leaked token soon stops working.
export const EXTERNAL_LIFETIME = 4 * 60 * 60;

// A relay URL and the token that admits its holder there for `lifetime` seconds.
export interface Grant {
	relay: URL;
	token: string;
	lifetime: number;
}

// Tokens for a tool outside the browser: `publish` streams in beneath the fresh identity `path`, `subscribe` only watches.
export interface External {
	relay: URL;
	path: string;
	publish: string;
	subscribe: string;
	lifetime: number;
}

// The relay URL carrying its token, which tabs open from before renewal dial as is; remove once they are gone.
export function legacyUrl(grant: Grant): URL {
	const url = new URL(grant.relay);
	url.searchParams.set("jwt", grant.token);
	return url;
}

type Relay = Record<"RELAY_SECRET" | "RELAY_PREFIX" | "RELAY_URL", string>;

// Signs relay tokens scoped to rooms with the relay's secret key.
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
		return await this.#grant(this.#room(room), { subscribe: [""], publish: [identity] }, LIFETIME);
	}

	// Grants watching the listed rooms without publishing, or undefined for none.
	async signPreview(rooms: Name[]): Promise<Grant | undefined> {
		if (rooms.length === 0) return undefined;
		return await this.#grant(this.#env.RELAY_PREFIX, { subscribe: rooms }, LIFETIME);
	}

	// Mints an identity no participant holds, so the publish token can never stream as anyone else.
	// Uncapped like a participant's: the released relay refuses a grant with a `rate`.
	async signExternal(room: Name): Promise<External> {
		const path = `external/${crypto.randomUUID()}`;
		const root = this.#room(room);
		const publish = await this.#grant(root, { publish: [path] }, EXTERNAL_LIFETIME);
		const subscribe = await this.#grant(root, { subscribe: [""] }, EXTERNAL_LIFETIME);
		return {
			relay: publish.relay,
			path,
			publish: publish.token,
			subscribe: subscribe.token,
			lifetime: EXTERNAL_LIFETIME,
		};
	}

	#room(room: Name): string {
		return `${this.#env.RELAY_PREFIX}/${room}`;
	}

	async #grant(
		root: string,
		grants: Pick<MoqAuth.Claims, "publish" | "subscribe">,
		lifetime: number,
	): Promise<Grant> {
		const expires = Math.floor(wall().asUnixMillis() / 1000) + lifetime;
		const token = await MoqAuth.Key.sign(this.#key, { root, ...grants, expires });
		// The token rides apart from the URL, so the app can replace it without redialing.
		return { relay: new URL(root, this.#env.RELAY_URL), token, lifetime };
	}
}

// Routes under /room to join a room or connect an external tool such as OBS.
export const router = rpc
	.router()
	.post(
		"/:room/join",
		rpc.withParam(z.object({ room: nameSchema })),
		rpc.withJson(
			z.object({
				// A tab open from before credentials sends its bare guest path, which proves nothing, so it joins as a new guest.
				guest: z.union([guestTokenSchema, guestSchema.transform(() => undefined)]).optional(),
			}),
		),
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
			return c.json({ ...grant, url: legacyUrl(grant), path, guest });
		},
	)
	// Open to anyone, as joining as a fresh guest is: the identity is new, so it widens no one's grant.
	.post("/:room/external", rpc.withParam(z.object({ room: nameSchema })), async (c) => {
		return c.json(await c.var.ctx.room.signExternal(c.req.valid("param").room));
	});
