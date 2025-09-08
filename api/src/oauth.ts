import { eq } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as jose from "jose";
import { z } from "zod";
import * as Account from "./account";
import * as Database from "./database";
import * as rpc from "./rpc";
import { OauthState, oauthStateSchema, oauthProviders as providers } from "./shared";
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
	#scopes: string;

	env: Env;
	db: Database.Context;
	id: ProviderId;

	constructor(env: Env, db: Database.Context, id: ProviderId) {
		this.env = env;
		this.db = db;
		this.id = id;

		this.#redirectUri = `${env.API_URL}/auth/${id}/callback`;

		if (id === "discord") {
			this.#clientId = env.DISCORD_CLIENT_ID;
			this.#clientSecret = env.DISCORD_CLIENT_SECRET;
			this.#baseUrl = "https://discord.com/oauth2/authorize";
			this.#tokenUrl = "https://discord.com/api/oauth2/token";
			this.#scopes = "identify email";
		} else if (id === "google") {
			this.#clientId = env.GOOGLE_CLIENT_ID;
			this.#clientSecret = env.GOOGLE_CLIENT_SECRET;
			this.#baseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
			this.#tokenUrl = "https://oauth2.googleapis.com/token";
			this.#scopes = "openid profile email";
		} else if (id === "apple") {
			this.#clientId = env.APPLE_CLIENT_ID;
			// Apple client secret is generated on-demand
			this.#clientSecret = "";
			this.#baseUrl = "https://appleid.apple.com/auth/authorize";
			this.#tokenUrl = "https://appleid.apple.com/auth/token";
			this.#scopes = "name email";
		} else {
			unreachable(id);
		}
	}

	authUrl(state: OauthState): string {
		const params = new URLSearchParams({
			client_id: this.#clientId,
			redirect_uri: this.#redirectUri,
			response_type: "code",
			scope: this.#scopes,
			state: JSON.stringify(state),
		});

		// Apple requires response_mode=form_post when name or email scope is requested
		if (this.id === "apple") {
			params.append("response_mode", "form_post");
		}

		return `${this.#baseUrl}?${params.toString()}`;
	}

	async exchangeCodeForToken(code: string): Promise<string> {
		// Generate Apple client secret JWT if needed
		if (!this.#clientSecret && this.id === "apple") {
			this.#clientSecret = await this.#generateAppleJwt();
		}

		const body = new URLSearchParams({
			client_id: this.#clientId,
			client_secret: this.#clientSecret,
			code,
			grant_type: "authorization_code",
			redirect_uri: this.#redirectUri,
		});

		const headers: Record<string, string> = {
			"Content-Type": "application/x-www-form-urlencoded",
		};

		// Apple requires the Accept header
		if (this.id === "apple") {
			headers.Accept = "application/json";
		}

		const response = await fetch(this.#tokenUrl, {
			method: "POST",
			headers,
			body: body.toString(),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to exchange code for token: ${response.statusText} - ${errorText}`);
		}

		const data = await response.json();
		const parsedData = tokenResponseSchema.safeParse(data);

		if (!parsedData.success) {
			throw new Error(`Invalid token response format: ${parsedData.error.message}`);
		}

		// Apple returns the user info in id_token, not access_token
		if (this.id === "apple" && parsedData.data.id_token) {
			return parsedData.data.id_token;
		}

		if (!parsedData.data.access_token) {
			throw new Error("No access token received from OAuth provider");
		}

		return parsedData.data.access_token;
	}

	async getUser(accessToken: string): Promise<User> {
		if (this.id === "discord") {
			return this.#getDiscordUser(accessToken);
		} else if (this.id === "google") {
			return this.#getGoogleUser(accessToken);
		} else if (this.id === "apple") {
			return this.#getAppleUser(accessToken);
		} else {
			unreachable(this.id);
		}
	}

	async #generateAppleJwt(): Promise<string> {
		if (this.id !== "apple") {
			throw new Error("Apple JWT generation only available for Apple provider");
		}

		// The private key is stored in APPLE_CLIENT_SECRET as base64 content only
		// Construct proper PEM format
		const base64Content = this.env.APPLE_CLIENT_SECRET.trim();
		const formattedBase64 = base64Content.match(/.{1,64}/g)?.join("\n") || base64Content;
		const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${formattedBase64}\n-----END PRIVATE KEY-----`;

		const privateKey = await jose.importPKCS8(privateKeyPem, "ES256");

		const jwt = await new jose.SignJWT({})
			.setProtectedHeader({
				alg: "ES256",
				kid: this.env.APPLE_KEY_ID,
				typ: "JWT",
			})
			.setIssuer(this.env.APPLE_TEAM_ID)
			.setIssuedAt()
			.setExpirationTime("6h") // Generate fresh JWT every 6 hours
			.setAudience("https://appleid.apple.com")
			.setSubject(this.#clientId)
			.sign(privateKey);

		return jwt;
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

	async #getAppleUser(idToken: string): Promise<User> {
		// Apple provides user info in the ID token, which must be verified
		// Fetch Apple's public keys for verification
		const JWKS = jose.createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

		// Verify and decode the ID token
		const { payload } = await jose.jwtVerify(idToken, JWKS, {
			issuer: "https://appleid.apple.com",
			audience: this.#clientId,
		});

		// Validate the payload structure
		const parsedUser = appleUserResponseSchema.safeParse(payload);
		if (!parsedUser.success) {
			throw new Error(`Invalid Apple user response format: ${parsedUser.error.message}`);
		}

		const user = parsedUser.data;

		// Apple provides the user's name only on the first authorization in the callback
		// Use email prefix as fallback for display name
		return {
			provider: "apple",
			providerId: user.sub,
			email: user.email,
			name: user.email.split("@")[0] || "Apple User", // Fallback to email prefix
			avatar: undefined, // Apple doesn't provide avatars
		};
	}

	// Apple sends user info in the callback on first authorization
	async updateAppleUser(user: string): Promise<void> {
		if (this.id !== "apple") {
			throw new Error("User update only available for Apple provider");
		}

		const rawUserData = JSON.parse(user);
		const parseResult = appleCallbackUserSchema.safeParse(rawUserData);
		if (!parseResult.success) {
			throw new Error(`Invalid Apple user data format: ${parseResult.error.message}`);
		}

		let name = parseResult.data.name.firstName || "";
		if (parseResult.data.name.lastName) {
			if (name) {
				name += " ";
			}
			name += parseResult.data.name.lastName;
		}

		if (!name) {
			// I guess this is possible.
			return;
		}

		await this.db.update(Account.table).set({ name }).where(eq(Account.table.email, parseResult.data.email));
	}

	async link(account: Account.Id, providerUser: string): Promise<void> {
		const now = new Date();

		await this.db
			.insert(table)
			.values({
				accountId: account,
				providerId: this.id,
				providerUser,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [table.accountId, table.providerId],
				set: {
					providerUser,
					updatedAt: now,
				},
			});
	}
}

// OAuth token response schema
const tokenResponseSchema = z.object({
	access_token: z.optional(z.string()), // Apple returns this in id_token instead
	id_token: z.optional(z.string()), // Apple uses id_token
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

// Apple ID token payload schema
const appleUserResponseSchema = z.object({
	sub: z.string(), // User ID
	email: z.string(),
	email_verified: z.optional(z.union([z.boolean(), z.string()])),
	is_private_email: z.optional(z.union([z.boolean(), z.string()])),
	real_user_status: z.optional(z.number()),
});

// Apple callback user data schema (sent on first authorization)
const appleCallbackUserSchema = z.object({
	name: z.object({
		firstName: z.string(),
		lastName: z.string(),
	}),
	email: z.string(),
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
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
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
	user: z.optional(z.string()),
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
		rpc.withQuery(oauthStateSchema),
		async (c) => {
			const ctx = c.var.ctx;

			const params = c.req.valid("param");
			const provider = ctx.oauth.provider(params.provider);

			const state = c.req.valid("query");
			const url = provider.authUrl(state);

			return c.json({ url });
		},
	)
	.all(
		"/:provider/callback",
		rpc.withParam(
			z.object({
				provider: providerIdSchema,
			}),
		),
		async (c) => {
			const ctx = c.var.ctx;

			// Validate provider parameter using Zod
			const provider = ctx.oauth.provider(c.req.valid("param").provider);

			// Handle both GET (Google/Discord) and POST (Apple) callbacks
			let callbackData: Callback;

			if (c.req.method === "POST") {
				// Apple form_post callback
				const formData = await c.req.formData();
				callbackData = callbackSchema.parse({
					code: formData.get("code"),
					state: formData.get("state"),
					user: formData.get("user"),
				});
			} else {
				// Google/Discord query params callback
				const url = new URL(c.req.url);
				callbackData = callbackSchema.parse({
					code: url.searchParams.get("code"),
					state: url.searchParams.get("state"),
					user: url.searchParams.get("user"),
				});
			}

			// Validate required fields
			if (!callbackData.code || !callbackData.state) {
				throw new Error("Missing required callback parameters");
			}

			// Exchange code for access token
			const accessToken = await provider.exchangeCodeForToken(callbackData.code);

			// Get user info
			const oauthUser = await provider.getUser(accessToken);

			// Apple sends user info in the callback on first authorization
			if (provider.id === "apple" && callbackData.user) {
				await provider.updateAppleUser(callbackData.user);
			}

			// Get or create a user account.
			// TODO Should we only use the email address to link accounts? Why look up by providerId?
			let user = await ctx.account.getByProvider(oauthUser.provider, oauthUser.providerId);
			if (!user) {
				// Try to find an existing account with the same email.
				user = await ctx.account.getByEmail(oauthUser.email);
				if (!user) {
					// Make a new account.
					user = await ctx.account.create({
						email: oauthUser.email,
						name: oauthUser.name,
						avatar: oauthUser.avatar,
					});
				}
			}

			await provider.link(user.id, oauthUser.providerId);

			// Generate JWT token
			const token = await ctx.auth.create(user.id);
			const state = callbackData.state;

			// Redirect to frontend with token
			const redirectUrl = `${ctx.env.APP_URL}?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;

			return c.redirect(redirectUrl);
		},
	);
