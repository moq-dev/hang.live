import { Database as Sqlite } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as jose from "jose";
import { oauthChallenge, oauthVerifier } from "../src/client";
import * as OAuth from "../src/oauth";
import { env, harness, mockFetch } from "./harness";

let restore: (() => void) | undefined;
afterEach(() => {
	restore?.();
	restore = undefined;
});

interface Discord {
	id: string;
	email?: string | null;
	verified?: boolean;
	avatar?: string | null;
	global_name?: string | null;
}

function discord(user: Discord, avatar?: () => Response) {
	const mocked = mockFetch((url) => {
		if (avatar && url.href === DISCORD_AVATAR) return avatar();
		if (url.href === "https://discord.com/api/oauth2/token")
			return Response.json({ access_token: "discord-access" });
		if (url.href === "https://discord.com/api/users/@me") return Response.json({ username: "someone", ...user });
		return undefined;
	});
	restore = mocked.restore;
	return mocked;
}

function google(user: { id: string; email: string; verified_email?: boolean }) {
	const mocked = mockFetch((url) => {
		if (url.href === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "google-access" });
		if (url.href === "https://www.googleapis.com/oauth2/v2/userinfo")
			return Response.json({ name: "Google User", ...user });
		return undefined;
	});
	restore = mocked.restore;
	return mocked;
}

async function state(redirect = `${env.APP_URL}/oauth/room`) {
	const verifier = oauthVerifier();
	return { verifier, state: JSON.stringify({ challenge: await oauthChallenge(verifier), redirect }) };
}

type App = ReturnType<typeof harness>["app"];

async function callback(app: App, provider: "discord" | "google", raw: string) {
	return await app.request(`/auth/${provider}/callback?code=provider-code&state=${encodeURIComponent(raw)}`);
}

// Run a full login, returning the session token.
async function login(app: App, provider: "discord" | "google"): Promise<string> {
	const { verifier, state: raw } = await state();
	const res = await callback(app, provider, raw);
	expect(res.status).toBe(302);
	const code = new URL(res.headers.get("Location") ?? "").searchParams.get("code");
	const token = await app.request("/auth/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code, verifier }),
	});
	expect(token.status).toBe(200);
	return ((await token.json()) as { token: string }).token;
}

async function info(app: App, token: string) {
	const res = await app.request("/account/info", { headers: { Authorization: `Bearer ${token}` } });
	expect(res.status).toBe(200);
	return (await res.json()) as { id: string; name: string; avatar: string };
}

test("redirects are checked by parsed origin, not by prefix", () => {
	for (const ok of ["https://hang.test/oauth/room", "https://hang.test/oauth/room?x=1"]) {
		expect(OAuth.validRedirect(env, ok)).toBe(true);
	}

	for (const bad of [
		"https://hang.test.evil.com/oauth",
		"https://hang.test@evil.com/oauth",
		"http://hang.test/oauth",
		"http://localhost:80@evil.com/oauth",
		"http://user@localhost:80/oauth",
		"http://localhost.evil.com/oauth",
		"https://localhost/oauth",
		"http://localhost:51234/oauth/room",
		"hang://oauth/room",
		"https://evil.com/?https://hang.test",
		"hang://evil/oauth",
		"javascript:alert(1)//https://hang.test",
		"/oauth/room",
		"not a url",
	]) {
		expect(OAuth.validRedirect(env, bad)).toBe(false);
	}
});

test("login refuses to start toward a foreign redirect", async () => {
	const { app } = harness();
	const challenge = await oauthChallenge(oauthVerifier());

	const bad = await app.request(
		`/auth/google/login?challenge=${challenge}&redirect=${encodeURIComponent("https://hang.test.evil.com/oauth")}`,
	);
	expect(bad.status).toBe(400);

	const ok = await app.request(
		`/auth/google/login?challenge=${challenge}&redirect=${encodeURIComponent(`${env.APP_URL}/oauth`)}`,
	);
	expect(ok.status).toBe(200);
	const url = new URL(((await ok.json()) as { url: string }).url);
	expect(JSON.parse(url.searchParams.get("state") ?? "")).toMatchObject({ challenge });
});

test("a forged callback redirect is rejected before any account is touched", async () => {
	const { app, sqlite } = harness();
	const mocked = discord({ id: "1", email: "a@example.com", verified: true });
	const { state: raw } = await state("https://hang.test.evil.com/oauth");

	const res = await callback(app, "discord", raw);
	expect(res.status).toBe(400);
	expect(mocked.calls).toEqual([]);
	expect(sqlite.query("SELECT count(*) AS n FROM accounts").get()).toEqual({ n: 0 });
});

test("malformed callbacks are client errors", async () => {
	const { app } = harness();
	expect((await app.request("/auth/discord/callback?code=x")).status).toBe(400);
	expect((await app.request("/auth/discord/callback?code=x&state=%7Bnot-json")).status).toBe(400);
	expect((await app.request("/auth/discord/callback?code=x&state=%7B%7D")).status).toBe(400);
});

test("the redirect carries a short-lived code, never the session token", async () => {
	const { app } = harness();
	discord({ id: "1", email: "a@example.com", verified: true, avatar: null, global_name: null });
	const { verifier, state: raw } = await state(`${env.APP_URL}/oauth/room?from=home`);

	const res = await callback(app, "discord", raw);
	expect(res.status).toBe(302);
	const location = new URL(res.headers.get("Location") ?? "");
	expect(location.origin).toBe(env.APP_URL);
	expect(location.pathname).toBe("/oauth/room");
	expect(location.searchParams.get("from")).toBe("home");
	expect(location.searchParams.has("token")).toBe(false);
	const code = location.searchParams.get("code") ?? "";

	// The code alone is not a session.
	const asSession = await app.request("/account/info", { headers: { Authorization: `Bearer ${code}` } });
	expect(asSession.status).toBe(401);

	const redeem = (body: unknown) =>
		app.request("/auth/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

	// Anyone who sees the URL, without the verifier, gets nothing.
	expect((await redeem({ code, verifier: oauthVerifier() })).status).toBe(401);

	const ok = await redeem({ code, verifier });
	expect(ok.status).toBe(200);
	const { token } = (await ok.json()) as { token: string };
	const account = await info(app, token);
	// Discord's null avatar and display name fall back cleanly.
	expect(account.name).toBe("someone");

	// A session token cannot pose as a code.
	expect((await redeem({ code: token, verifier })).status).toBe(401);
});

test("an expired code cannot be redeemed", async () => {
	const { ctx } = harness();
	const verifier = oauthVerifier();
	const challenge = await oauthChallenge(verifier);
	const code = await new jose.SignJWT({ challenge })
		.setProtectedHeader({ alg: "HS256", typ: "hang-oauth-code" })
		.setSubject("account")
		.setIssuedAt(Math.floor(Date.now() / 1000) - 600)
		.setExpirationTime(Math.floor(Date.now() / 1000) - 300)
		.sign(new TextEncoder().encode(env.AUTH_SECRET));
	expect(await ctx.auth.redeemCode(code, verifier)).toBeUndefined();
	// The same code shape, unexpired, would redeem.
	expect(await ctx.auth.redeemCode(await ctx.auth.createCode("account" as never, challenge), verifier)).toBeString();
});

test("an unverified email neither claims nor links an account", async () => {
	const { app, sqlite } = harness();

	google({ id: "g1", email: "victim@example.com", verified_email: true });
	const victim = await info(app, await login(app, "google"));
	restore?.();

	// Discord lets anyone type any address; without verification it must not reach the victim's account.
	discord({ id: "attacker", email: "victim@example.com", verified: false });
	const { state: raw } = await state();
	expect((await callback(app, "discord", raw)).status).toBe(403);
	expect(sqlite.query("SELECT provider_id FROM accounts_linked WHERE account_id = ?").all(victim.id)).toEqual([
		{ provider_id: "google" },
	]);
	restore?.();

	// Nor can an unverified address pre-claim an account for a later verified login to land in.
	google({ id: "g2", email: "unverified@example.com" });
	const second = await state();
	expect((await callback(app, "google", second.state)).status).toBe(403);
	expect(sqlite.query("SELECT count(*) AS n FROM accounts").get()).toEqual({ n: 1 });
});

test("a verified email links a new provider to the existing account", async () => {
	const { app } = harness();

	google({ id: "g1", email: "me@example.com", verified_email: true });
	const first = await info(app, await login(app, "google"));
	restore?.();

	discord({ id: "d1", email: "me@example.com", verified: true });
	const second = await info(app, await login(app, "discord"));
	expect(second.id).toBe(first.id);
});

test("an existing provider link logs in without consulting the email", async () => {
	const { app } = harness();

	discord({ id: "d1", email: "me@example.com", verified: true });
	const first = await info(app, await login(app, "discord"));
	restore?.();

	// The user later unverified or removed their Discord email; the link by provider ID still holds.
	discord({ id: "d1", email: null });
	const second = await info(app, await login(app, "discord"));
	expect(second.id).toBe(first.id);
});

test("Apple's unsigned user field only names a newly created account", async () => {
	// Apple's ID token signer, and the key the API signs its Apple client secret with.
	const apple = await jose.generateKeyPair("ES256", { extractable: true });
	const client = await jose.generateKeyPair("ES256", { extractable: true });
	const jwk = { ...(await jose.exportJWK(apple.publicKey)), kid: "apple", alg: "ES256" };
	// Production stores the PKCS8 key as bare base64.
	const secret = (await jose.exportPKCS8(client.privateKey)).replace(/-----[A-Z ]+-----|\s+/g, "");
	const { app, sqlite } = harness({ APPLE_CLIENT_SECRET: secret });

	google({ id: "g1", email: "victim@example.com", verified_email: true });
	const victim = await info(app, await login(app, "google"));
	restore?.();

	let idToken = "";
	const signIn = async (sub: string, email: string) => {
		idToken = await new jose.SignJWT({ email, email_verified: "true" })
			.setProtectedHeader({ alg: "ES256", kid: "apple" })
			.setIssuer("https://appleid.apple.com")
			.setAudience(env.APPLE_CLIENT_ID)
			.setSubject(sub)
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(apple.privateKey);
	};
	restore = mockFetch((url) => {
		if (url.href === "https://appleid.apple.com/auth/token") return Response.json({ id_token: idToken });
		if (url.href === "https://appleid.apple.com/auth/keys") return Response.json({ keys: [jwk] });
		return undefined;
	}).restore;

	const post = async (user: unknown) => {
		const { state: raw } = await state();
		const form = new FormData();
		form.set("code", "apple-code");
		form.set("state", raw);
		form.set("user", JSON.stringify(user));
		return await app.request("/auth/apple/callback", { method: "POST", body: form });
	};

	// The attacker's own Apple login, with a forged user field naming the victim's email.
	await signIn("apple-attacker", "attacker@privaterelay.appleid.com");
	expect((await post({ name: { firstName: "Pwned" }, email: "victim@example.com" })).status).toBe(302);
	expect(sqlite.query("SELECT name FROM accounts WHERE id = ?").get(victim.id)).toEqual({ name: "Google User" });
	// The attacker's new account takes the name, with no last name required.
	expect(sqlite.query("SELECT name FROM accounts WHERE email = ?").get("attacker@privaterelay.appleid.com")).toEqual({
		name: "Pwned",
	});

	// The victim later adding Apple keeps their existing name.
	await signIn("apple-victim", "victim@example.com");
	expect((await post({ name: { firstName: "Renamed", lastName: "Again" } })).status).toBe(302);
	expect(sqlite.query("SELECT name FROM accounts WHERE id = ?").get(victim.id)).toEqual({ name: "Google User" });
	expect(
		sqlite.query("SELECT provider_id FROM accounts_linked WHERE account_id = ? ORDER BY 1").all(victim.id),
	).toEqual([{ provider_id: "apple" }, { provider_id: "google" }]);

	// A malformed user field is a client error, not a crash.
	await signIn("apple-new", "new@privaterelay.appleid.com");
	const form = new FormData();
	form.set("code", "apple-code");
	form.set("state", (await state()).state);
	form.set("user", "{not json");
	expect((await app.request("/auth/apple/callback", { method: "POST", body: form })).status).toBe(400);
});

test("a legacy account with an unverified link cannot absorb its email's verified owner", async () => {
	const { app, sqlite } = harness();

	// Before verification was checked, an attacker could create an account from an unverified Discord address.
	discord({ id: "attacker", email: "victim@example.com", verified: true });
	const attacker = await info(app, await login(app, "discord"));
	restore?.();
	sqlite.query("UPDATE accounts_linked SET email_verified = 0 WHERE account_id = ?").run(attacker.id);

	google({ id: "victim", email: "victim@example.com", verified_email: true });
	const { state: raw } = await state();
	expect((await callback(app, "google", raw)).status).toBe(409);
	expect(sqlite.query("SELECT provider_id FROM accounts_linked WHERE account_id = ?").all(attacker.id)).toEqual([
		{ provider_id: "discord" },
	]);
	restore?.();

	// A legacy link that signs in again with a verified, matching address vouches for the account again.
	discord({ id: "attacker", email: "victim@example.com", verified: true });
	await login(app, "discord");
	restore?.();
	google({ id: "victim", email: "victim@example.com", verified_email: true });
	expect((await info(app, await login(app, "google"))).id).toBe(attacker.id);
	restore?.();

	// Signing in with an address other than the account's no longer vouches for it.
	discord({ id: "attacker", email: "other@example.com", verified: true });
	await login(app, "discord");
	expect(sqlite.query("SELECT email_verified FROM accounts_linked WHERE provider_id = 'discord'").get()).toEqual({
		email_verified: 0,
	});
});

test("the migration leaves every legacy link unverified", () => {
	const sqlite = new Sqlite(":memory:");
	const dir = new URL("../migrations/", import.meta.url).pathname;
	const files = readdirSync(dir)
		.filter((file) => file.endsWith(".sql"))
		.sort();
	const run = (file: string) => sqlite.exec(readFileSync(`${dir}${file}`, "utf8"));
	for (const file of files.filter((file) => file < "0004")) run(file);

	sqlite.exec(
		"INSERT INTO accounts (id, email, name, avatar) VALUES ('a', 'a@example.com', 'Some One', '/avatar/1.svg')",
	);
	for (const provider of ["google", "apple", "discord"]) {
		sqlite.exec(
			`INSERT INTO accounts_linked (account_id, provider_id, provider_user) VALUES ('a', '${provider}', 'u')`,
		);
	}
	for (const file of files.filter((file) => file >= "0004")) run(file);

	// Nothing recorded which addresses were verified, so no provider is trusted on its name alone.
	expect(sqlite.query("SELECT DISTINCT email_verified FROM accounts_linked").all()).toEqual([{ email_verified: 0 }]);
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const DISCORD_AVATAR = "https://cdn.discordapp.com/avatars/1/abc.png?size=512";

// Discord login whose avatar CDN answers with `avatar`.
function discordWithAvatar(avatar: () => Response) {
	return discord({ id: "1", email: "a@example.com", verified: true, avatar: "abc" }, avatar);
}

test("signup copies the provider avatar into R2, so peers never load the provider's CDN", async () => {
	const { app, bucket } = harness();
	discordWithAvatar(() => new Response(PNG));

	const me = await info(app, await login(app, "discord"));
	expect(me.avatar).toStartWith(`${env.R2_PUBLIC_URL}/avatar/`);
	const [key] = [...bucket.objects.keys()];
	expect(me.avatar).toBe(`${env.R2_PUBLIC_URL}/${key}`);
	expect(bucket.objects.get(key ?? "")?.contentType).toBe("image/png");
});

test("a provider avatar that fails to copy leaves a bundled default", async () => {
	for (const avatar of [
		() => new Response("nope", { status: 404 }),
		() => new Response("<svg onload=alert(1)>"),
		() => new Response(new Uint8Array(6 * 1024 * 1024)),
	]) {
		restore?.();
		const { app, bucket } = harness();
		discordWithAvatar(avatar);

		const me = await info(app, await login(app, "discord"));
		expect(me.avatar).toMatch(/^\/avatar\/\d+\.svg$/);
		expect(bucket.objects.size).toBe(0);
	}
});

test("an account still on a provider CDN avatar moves to R2 on its next login", async () => {
	const { app, sqlite } = harness();
	discordWithAvatar(() => new Response(PNG));
	const token = await login(app, "discord");
	sqlite.exec("UPDATE accounts SET avatar = 'https://cdn.discordapp.com/avatars/1/old.png', avatar_type = 'url'");
	expect((await info(app, token)).avatar).toBe("https://cdn.discordapp.com/avatars/1/old.png");

	expect((await info(app, await login(app, "discord"))).avatar).toStartWith(`${env.R2_PUBLIC_URL}/avatar/`);
});

test("a login with no provider avatar leaves a legacy one for a later login to copy", async () => {
	const { app, sqlite } = harness();
	discord({ id: "1", email: "a@example.com", verified: true, avatar: null });
	const token = await login(app, "discord");
	sqlite.exec("UPDATE accounts SET avatar = 'https://cdn.discordapp.com/avatars/1/old.png', avatar_type = 'url'");

	await login(app, "discord");
	expect((await info(app, token)).avatar).toBe("https://cdn.discordapp.com/avatars/1/old.png");
});

test("migration never overwrites an avatar picked after it read the legacy one", async () => {
	const { ctx, bucket, sqlite } = harness();
	const { id } = await ctx.account.create({ name: "Alice", email: "alice@example.com" });
	sqlite.exec("UPDATE accounts SET avatar = '/avatar/3.svg', avatar_type = 'url'");

	await ctx.account.replaceExternalAvatar(id, "https://cdn.discordapp.com/avatars/1/old.png", {
		data: PNG,
		extension: "png",
		contentType: "image/png",
	});
	expect((await ctx.account.get(id))?.avatar).toBe("/avatar/3.svg");
	expect(bucket.objects.size).toBe(0);
});

test("an R2 failure at signup still signs in, on a bundled default", async () => {
	const { app, bucket } = harness();
	bucket.put = async () => {
		throw new Error("R2 unavailable");
	};
	discordWithAvatar(() => new Response(PNG));

	expect((await info(app, await login(app, "discord"))).avatar).toMatch(/^\/avatar\/\d+\.svg$/);
});

test("only the provider that supplied a legacy avatar replaces it", async () => {
	const { app, sqlite } = harness();
	discordWithAvatar(() => new Response(PNG));
	const token = await login(app, "discord");
	sqlite.exec("UPDATE accounts SET avatar = 'https://lh3.googleusercontent.com/a/old', avatar_type = 'url'");

	await login(app, "discord");
	expect((await info(app, token)).avatar).toBe("https://lh3.googleusercontent.com/a/old");
});
