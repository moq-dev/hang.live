import { eq, sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod/mini";
import * as Account from "./account";
import { oauthProviders as providers } from "./client";
import * as Database from "./database";
import * as rpc from "./rpc";
import { unreachable } from "./util";

export type ProviderId = (typeof providers)[number];
export const providerIdSchema = z.enum(providers);

export class Context {
	env: Env;
	db: Database.Context;

	constructor(env: Env, db: Database.Context) {
		this.env = env;
		this.db = db;
	}

	provider(id: ProviderId): Provider {
		return new Provider(this.env, this.db, id);
	}

	async getLinks(account: Account.Id): Promise<Row[]> {
		return await this.db.select().from(table).where(eq(table.accountId, account));
	}
}

export class Provider {
	#clientId: string;
	#clientSecret: string;
	#redirectUri: string;
	#baseUrl: string;
	#tokenUrl: string;

	env: Env;
	db: Database.Context;
	id: ProviderId;

	constructor(env: Env, db: Database.Context, id: ProviderId) {
		this.env = env;
		this.db = db;
		this.id = id;

		console.log("env", env);

		this.#redirectUri = `${env.API_URL}/auth/${id}/callback`;

		if (id === "discord") {
			this.#clientId = env.DISCORD_CLIENT_ID;
			this.#clientSecret = env.DISCORD_CLIENT_SECRET;
			this.#baseUrl = "https://discord.com/oauth2/authorize";
			this.#tokenUrl = "https://discord.com/api/oauth2/token";
		} else if (id === "google") {
			this.#clientId = env.GOOGLE_CLIENT_ID;
			this.#clientSecret = env.GOOGLE_CLIENT_SECRET;
			this.#baseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
			this.#tokenUrl = "https://oauth2.googleapis.com/token";
		} else {
			unreachable(id);
		}
	}

	authUrl(state: string): string {
		const params = new URLSearchParams({
			client_id: this.#clientId,
			redirect_uri: this.#redirectUri,
			response_type: "code",
			scope: "openid profile email",
			state,
		});

		return `${this.#baseUrl}?${params.toString()}`;
	}

	async exchangeCodeForToken(code: string): Promise<string> {
		const body = new URLSearchParams({
			client_id: this.#clientId,
			client_secret: this.#clientSecret,
			code,
			grant_type: "authorization_code",
			redirect_uri: this.#redirectUri,
		});

		const response = await fetch(this.#tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			throw new Error(`Failed to exchange code for token: ${response.statusText}`);
		}

		const data = await response.json();
		const parsedData = tokenResponseSchema.safeParse(data);

		if (!parsedData.success) {
			throw new Error(`Invalid token response format: ${parsedData.error.message}`);
		}

		return parsedData.data.access_token;
	}

	async getUser(accessToken: string): Promise<User> {
		if (this.id === "discord") {
			return this.#getDiscordUser(accessToken);
		} else if (this.id === "google") {
			return this.#getGoogleUser(accessToken);
		} else {
			unreachable(this.id);
		}
	}

	async #getDiscordUser(accessToken: string): Promise<User> {
		const response = await fetch("https://discord.com/api/users/@me", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get Discord user info: ${response.statusText}`);
		}

		const data = await response.json();
		const parsedUser = discordUserResponseSchema.safeParse(data);

		if (!parsedUser.success) {
			throw new Error(`Invalid Discord user response format: ${parsedUser.error.message}`);
		}

		const user = parsedUser.data;

		// Construct Discord avatar URL properly
		// Discord avatars can be null/undefined (default avatar) or a hash string
		// The hash might be for an animated GIF (starts with "a_") or static image
		let avatarUrl: string | undefined;
		if (user.avatar) {
			const extension = user.avatar.startsWith("a_") ? "gif" : "png";
			avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}`;
		}
		// If avatar is null/undefined, we could construct a default avatar URL, but it's better to leave it undefined
		// Default Discord avatars: https://cdn.discordapp.com/embed/avatars/{discriminator % 5}.png
		// But discriminator is being phased out, so we'll leave avatar as undefined for default avatars

		return {
			provider: this.id,
			providerId: user.id,
			email: user.email,
			name: user.global_name || user.username, // Prefer display name over username
			avatar: avatarUrl,
		};
	}

	async #getGoogleUser(accessToken: string): Promise<User> {
		const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get Google user info: ${response.statusText}`);
		}

		const data = await response.json();
		const parsedUser = googleUserResponseSchema.safeParse(data);

		if (!parsedUser.success) {
			throw new Error(`Invalid Google user response format: ${parsedUser.error.message}`);
		}

		const user = parsedUser.data;

		return {
			provider: "google",
			providerId: user.id,
			email: user.email,
			name: user.name,
			avatar: user.picture,
		};
	}

	async link(account: Account.Id, providerUser: string): Promise<void> {
		await this.db
			.insert(table)
			.values({
				accountId: account,
				providerId: this.id,
				providerUser,
			})
			.onConflictDoUpdate({
				target: [table.accountId, table.providerId],
				set: {
					providerUser,
				},
			});
	}
}

// OAuth token response schema
const tokenResponseSchema = z.object({
	access_token: z.string(),
	token_type: z.optional(z.string()),
	expires_in: z.optional(z.number()),
	scope: z.optional(z.string()),
});

// Discord user API response schema
const discordUserResponseSchema = z.object({
	id: z.string(),
	username: z.string(),
	email: z.string(),
	avatar: z.optional(z.string()), // Discord avatar is either a hash string or null/undefined
	discriminator: z.optional(z.string()), // Legacy field, may not be present
	global_name: z.optional(z.string()), // New display name field, can be null
});

// Google user API response schema
const googleUserResponseSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
	picture: z.optional(z.string()),
	verified_email: z.optional(z.boolean()),
});

export interface User {
	provider: ProviderId;
	providerId: string;
	email: string;
	name: string;
	avatar?: string;
}

export const table = sqliteTable(
	"accounts_linked",
	{
		accountId: text("account_id")
			.notNull()
			.references(() => Account.table.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		providerUser: text("provider_user").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.providerId] })],
);

export type Row = typeof table.$inferSelect;
export type NewRow = typeof table.$inferInsert;

export const loginSchema = z.object({
	provider: providerIdSchema,
});

export const loginResponseSchema = z.object({
	url: z.string(),
});

export const callbackSchema = z.object({
	provider: providerIdSchema,
	code: z.string(),
	state: z.string(),
});

export const callbackResponseSchema = z.object({
	token: z.string(),
	redirectUrl: z.string(),
});

export type Login = z.infer<typeof loginSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type Callback = z.infer<typeof callbackSchema>;
export type CallbackResponse = z.infer<typeof callbackResponseSchema>;

export const router = rpc
	.router()
	.get(
		"/:provider/login",
		rpc.withParam(
			z.object({
				provider: providerIdSchema,
			}),
		),
		async (c) => {
			const ctx = c.var.ctx;

			const params = c.req.valid("param");
			const provider = ctx.oauth.provider(params.provider);

			const state = Math.random().toString(36).substring(2, 15);
			const url = provider.authUrl(state);

			return c.redirect(url);
		},
	)
	.get(
		"/:provider/callback",
		rpc.withParam(
			z.object({
				provider: providerIdSchema,
			}),
		),
		rpc.withQuery(
			z.object({
				code: z.string(),
				state: z.string(),
			}),
		),
		async (c) => {
			const ctx = c.var.ctx;

			// Validate provider parameter using Zod
			const provider = ctx.oauth.provider(c.req.valid("param").provider);

			// Exchange code for access token
			const accessToken = await provider.exchangeCodeForToken(c.req.valid("query").code);

			// Get user info
			const oauthUser = await provider.getUser(accessToken);

			// Find or create user
			let user = await ctx.account.getByProvider(oauthUser.provider, oauthUser.providerId);
			if (!user) {
				const existingUser = await ctx.account.getByEmail(oauthUser.email);
				if (existingUser) {
					user = existingUser;
				} else {
					user = await ctx.account.create({
						email: oauthUser.email,
						name: oauthUser.name,
						avatar: oauthUser.avatar,
					});
				}
			}

			await provider.link(user.id, oauthUser.providerId);

			// Generate JWT token
			const token = await ctx.jwt.create(user.id);

			// Redirect to frontend with token
			const redirectUrl = `${ctx.env.APP_URL}?token=${encodeURIComponent(token)}`;

			return c.redirect(redirectUrl);
		},
	);
