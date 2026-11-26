import { createMiddleware } from "hono/factory";
import * as JWT from "jose";
import { z } from "zod";
import { Account } from ".";
import { accountIdSchema, oauthChallenge } from "./client";
import RootContext from "./context";

// Use ZOD to validate the payload
const tokenSchema = z.object({
	sub: accountIdSchema,
	exp: z.number(),
	iat: z.number(),
});

export type Token = z.infer<typeof tokenSchema>;

const codeSchema = z.object({
	sub: accountIdSchema,
	challenge: z.string(),
});

// Login codes carry this header type so they can never pass as a session token, or vice versa.
const CODE_TYPE = "hang-oauth-code";

// Long enough to load the app from a deep link, short enough that a leaked code soon expires.
const CODE_LIFETIME = 5 * 60;

export class Context {
	#secretKey: Uint8Array;

	constructor(env: { AUTH_SECRET: string }) {
		this.#secretKey = new TextEncoder().encode(env.AUTH_SECRET);
	}

	async create(userId: string, expiresIn: number = 365 * 24 * 60 * 60): Promise<string> {
		const now = Math.floor(Date.now() / 1000);

		return await new JWT.SignJWT({
			sub: userId,
			iat: now,
			exp: now + expiresIn,
		})
			.setProtectedHeader({ alg: "HS256" })
			.sign(this.#secretKey);
	}

	// Returns the session, or undefined for a token that is malformed, expired, forged, or not a session.
	async verify(token: string): Promise<Token | undefined> {
		let verified: JWT.JWTVerifyResult;
		try {
			verified = await JWT.jwtVerify(token, this.#secretKey, { algorithms: ["HS256"] });
		} catch {
			return;
		}

		if (verified.protectedHeader.typ !== undefined) return;

		const parsed = tokenSchema.safeParse(verified.payload);
		if (!parsed.success) {
			console.warn("failed to verify token", parsed.error);
			return;
		}

		return parsed.data;
	}

	// Mint a short-lived login code that only the holder of the challenge's verifier can redeem.
	async createCode(account: Account.Id, challenge: string): Promise<string> {
		return await new JWT.SignJWT({ challenge })
			.setProtectedHeader({ alg: "HS256", typ: CODE_TYPE })
			.setSubject(account)
			.setIssuedAt()
			.setExpirationTime(`${CODE_LIFETIME}s`)
			.sign(this.#secretKey);
	}

	// Exchange a login code and its verifier for a session token, or undefined if either is wrong.
	async redeemCode(code: string, verifier: string): Promise<string | undefined> {
		let payload: JWT.JWTPayload;
		try {
			({ payload } = await JWT.jwtVerify(code, this.#secretKey, { algorithms: ["HS256"], typ: CODE_TYPE }));
		} catch {
			return;
		}

		const parsed = codeSchema.safeParse(payload);
		if (!parsed.success) return;
		if ((await oauthChallenge(verifier)) !== parsed.data.challenge) return;

		return await this.create(parsed.data.sub);
	}
}

export const required = createMiddleware<{
	Bindings: Env;
	Variables: {
		account_id: Account.Id;
		ctx: RootContext;
	};
}>(async (c, next) => {
	const token = c.req.header("Authorization")?.replace(/^Bearer\s+/, "");
	if (!token) return c.text("Unauthorized", 401);

	const user = await c.var.ctx.auth.verify(token);
	if (!user) return c.text("Unauthorized", 401);

	c.set("account_id", user.sub);
	return await next();
});

export const optional = createMiddleware<{
	Bindings: Env;
	Variables: {
		account_id?: Account.Id;
		ctx: RootContext;
	};
}>(async (c, next) => {
	const token = c.req.header("Authorization")?.replace(/^Bearer\s+/, "");
	if (!token) return await next();

	const user = await c.var.ctx.auth.verify(token);
	if (!user) return await next();

	c.set("account_id", user.sub);
	return await next();
});
