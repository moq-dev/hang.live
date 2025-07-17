import { createMiddleware } from "hono/factory";
import * as JWT from "jose";
import { z } from "zod/mini";
import { Account } from ".";
import RootContext from "./context";

export const accountIdSchema = z.uuidv4().brand("AccountId");
export type AccountId = z.infer<typeof accountIdSchema>;

// Use ZOD to validate the payload
const tokenSchema = z.object({
	sub: accountIdSchema,
	exp: z.number(),
	iat: z.number(),
});

export type Token = z.infer<typeof tokenSchema>;

export class Context {
	#secretKey: Uint8Array;

	constructor(env: Env) {
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

	async verify(token: string): Promise<Token | undefined> {
		const { payload } = await JWT.jwtVerify(token, this.#secretKey);
		const parsed = tokenSchema.safeParse(payload);
		if (!parsed.success) {
			console.warn("failed to verify token", parsed.error);
			return;
		}

		return parsed.data;
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
