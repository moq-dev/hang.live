import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import { z } from "zod";
import type * as Account from "./account";
import * as Avatar from "./avatar";
import { type OauthState, oauthStateSchema, oauthTokenSchema, oauthProviders as providers } from "./client";
import type * as Database from "./database";
import * as rpc from "./rpc";
import * as Tables from "./tables";
import { unreachable } from "./util";

export type ProviderId = (typeof providers)[number];
const providerIdSchema = z.enum(providers);

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

	// Whether any sign-in method on the account never proved control of its email address.
	async hasUnverifiedLink(account: Account.Id): Promise<boolean> {
		const rows = await this.db
			.select({ providerId: table.providerId })
			.from(table)
			.where(and(eq(table.accountId, account), eq(table.emailVerified, false)))
			.limit(1);
		return rows.length > 0;
	}
}

class Provider {
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
			// Ask for the largest size we render, instead of whatever Discord defaults to.
			avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=512`;
		}

		return {
			provider: this.id,
			providerId: user.id,
			email: user.email ?? undefined,
			emailVerified: user.verified === true,
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
			emailVerified: user.verified_email === true,
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
			emailVerified: user.email_verified === true || user.email_verified === "true",
			name: user.email.split("@")[0] || "Apple User", // Fallback to email prefix
			avatar: undefined, // Apple doesn't provide avatars
		};
	}

	async link(account: Account.Id, user: User): Promise<void> {
		const now = new Date();
		const providerUser = user.providerId;

		// The link vouches for the account only when the provider verified the account's own address.
		const owner = (
			await this.db
				.select({ email: Tables.accounts.email })
				.from(Tables.accounts)
				.where(eq(Tables.accounts.id, account))
				.limit(1)
		).at(0);
		const emailVerified = user.emailVerified && user.email !== undefined && user.email === owner?.email;

		await this.db
			.insert(table)
			.values({
				accountId: account,
				providerId: this.id,
				providerUser,
				emailVerified,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [table.accountId, table.providerId],
				set: {
					providerUser,
					emailVerified,
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
	email: z.nullish(z.string()), // null when the user never added an email
	verified: z.optional(z.boolean()), // whether the email is verified
	avatar: z.nullish(z.string()), // null for the default avatar
	global_name: z.nullish(z.string()), // display name, null when unset
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

// Apple posts the user's name alongside the code, only on the first authorization.
// Nothing in it is signed, so only the name is used, and only for a newly created account.
const appleCallbackUserSchema = z.object({
	name: z.optional(
		z.object({
			firstName: z.optional(z.string()),
			lastName: z.optional(z.string()),
		}),
	),
});

// The display name in Apple's first-authorization user field, if any.
function appleName(user: string): string | undefined {
	let json: unknown;
	try {
		json = JSON.parse(user);
	} catch {
		throw new HTTPException(400, { message: "Invalid Apple user data" });
	}

	const parsed = appleCallbackUserSchema.safeParse(json);
	if (!parsed.success) {
		throw new HTTPException(400, { message: "Invalid Apple user data" });
	}

	const name = [parsed.data.name?.firstName, parsed.data.name?.lastName]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join(" ");
	return name || undefined;
}

// Whether the API may send a finished login to this URL.
// Parsed rather than prefix-matched, so `https://hang.live.evil.com` and `https://hang.live@evil.com` fail.
export function validRedirect(env: { APP_URL: string }, redirect: string): boolean {
	let url: URL;
	try {
		url = new URL(redirect);
	} catch {
		return false;
	}

	if (url.username || url.password) return false;

	return url.origin === new URL(env.APP_URL).origin;
}

function parseState(raw: string): OauthState {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new HTTPException(400, { message: "Invalid OAuth state" });
	}

	const parsed = oauthStateSchema.safeParse(json);
	if (!parsed.success) {
		throw new HTTPException(400, { message: "Invalid OAuth state" });
	}

	return parsed.data;
}

// Whether an avatar URL is hosted by the given provider's CDN.
function avatarFrom(provider: ProviderId, url: string): boolean {
	const host = URL.parse(url)?.hostname;
	if (!host) return false;
	switch (provider) {
		case "discord":
			return host === "cdn.discordapp.com";
		case "google":
			return host.endsWith(".googleusercontent.com");
		case "apple":
			return false;
	}
}

interface User {
	provider: ProviderId;
	providerId: string;
	email?: string;
	// Whether the provider vouches that the user controls `email`.
	emailVerified: boolean;
	name: string;
	avatar?: string;
}

const table = Tables.linked;

const callbackSchema = z.object({
	code: z.string(),
	state: z.string(),
	user: z.string().nullable().optional(),
});

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
			if (!validRedirect(ctx.env, state.redirect)) {
				return c.json({ error: "Invalid redirect URL" }, 400);
			}

			const url = provider.authUrl(state);

			return c.json({ url }, 200);
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

			const provider = ctx.oauth.provider(c.req.valid("param").provider);

			// Handle both GET (Google/Discord) and POST (Apple form_post) callbacks
			const fields = c.req.method === "POST" ? await c.req.formData() : new URL(c.req.url).searchParams;
			const parsed = callbackSchema.safeParse({
				code: fields.get("code"),
				state: fields.get("state"),
				user: fields.get("user"),
			});
			if (!parsed.success) {
				throw new HTTPException(400, { message: "Missing OAuth callback parameters" });
			}
			const callbackData = parsed.data;

			// The state round-trips through the provider and the browser, so check it before acting on it.
			const state = parseState(callbackData.state);
			if (!validRedirect(ctx.env, state.redirect)) {
				throw new HTTPException(400, { message: "Invalid redirect URL" });
			}

			// Exchange code for access token
			const accessToken = await provider.exchangeCodeForToken(callbackData.code);

			// Get user info
			const oauthUser = await provider.getUser(accessToken);

			// Copy the provider's avatar into R2 so peers never fetch from its CDN, which would reveal their IPs to it.
			// The avatar is cosmetic, so a failed copy logs and leaves the account on a bundled default.
			const copyAvatar = async () => {
				if (!oauthUser.avatar) return undefined;
				return await Avatar.download(oauthUser.avatar).catch((err) => {
					console.error(`failed to copy ${provider.id} avatar`, err);
					return undefined;
				});
			};

			let user = await ctx.account.getByProvider(oauthUser.provider, oauthUser.providerId);
			if (!user) {
				// Matching or claiming an email is only safe when the provider verified it.
				// Otherwise anyone could sign up with a victim's address and take over (or pre-hijack) their account.
				if (!oauthUser.email || !oauthUser.emailVerified) {
					throw new HTTPException(403, { message: `Verify your email address with ${provider.id} first.` });
				}

				user = await ctx.account.getByEmail(oauthUser.email);
				// Before verification was checked, anyone could claim an address; such an account may not be its owner's.
				if (user && (await ctx.oauth.hasUnverifiedLink(user.id))) {
					throw new HTTPException(409, {
						message: "Sign in once with the method you used before, then try this one again.",
					});
				}
				if (!user) {
					const name =
						provider.id === "apple" && callbackData.user ? appleName(callbackData.user) : undefined;
					user = await ctx.account.create({
						email: oauthUser.email,
						name: name ?? oauthUser.name,
						avatar: await copyAvatar(),
					});
				}
			}

			// Accounts from before the copy still point at a provider CDN; move them over as they sign in with one.
			// Peers refuse the old URL either way, so a provider without an avatar or a failed copy leaves it be.
			// Only the provider that supplied the legacy avatar replaces it, so a linked account's photo never does.
			const external = await ctx.account.externalAvatar(user.id);
			const upload = external && avatarFrom(provider.id, external) ? await copyAvatar() : undefined;
			if (external && upload) {
				const id = user.id;
				await ctx.account.replaceExternalAvatar(id, external, upload).catch((err) => {
					console.error(`failed to migrate avatar for ${id}`, err);
				});
			}

			await provider.link(user.id, oauthUser);

			// Hand the browser a short-lived code instead of the session token, since URLs leak
			// through history and logs.
			const code = await ctx.auth.createCode(user.id, state.challenge);
			const redirect = new URL(state.redirect);
			redirect.searchParams.set("code", code);

			return c.redirect(redirect.toString());
		},
	)
	.post("/token", rpc.withJson(oauthTokenSchema), async (c) => {
		const { code, verifier } = c.req.valid("json");
		const token = await c.var.ctx.auth.redeemCode(code, verifier);
		if (!token) {
			return c.json({ error: "Invalid or expired login code" }, 401);
		}

		return c.json({ token }, 200);
	});
