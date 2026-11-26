import { expect, test } from "bun:test";
import { oauthChallenge } from "@hang/api/client";

// Answer the API like a server would, recording each request.
const requests: { url: string; body?: string }[] = [];
let infoStatus = 200;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
	const url = input instanceof Request ? input.url : input.toString();
	const body = typeof init?.body === "string" ? init.body : undefined;
	requests.push({ url, body });
	if (url.endsWith("/account/info")) {
		return infoStatus === 200
			? Response.json({ id: "id", name: "Some Name", avatar: "/avatar/1.svg" })
			: new Response("Unauthorized", { status: infoStatus });
	}
	if (url.endsWith("/auth/token")) {
		const { code } = JSON.parse(body ?? "{}");
		return code === "good" ? Response.json({ token: "session" }) : new Response("Unauthorized", { status: 401 });
	}
	if (url.includes("/auth/google/login")) return Response.json({ url: "about:blank" });
	throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

// Bun maps import.meta.env to process.env.
process.env.VITE_API_URL = "https://api.test";

// A stale token left from a previous session.
localStorage.setItem("settings.oauth.token", "stale");
infoStatus = 401;

const { default: Settings } = await import("./settings");
// The client checks the stored token as soon as it loads, so wait from before then.
const dropped = Settings.oauth.token.changed();
const { client } = await import("./api");

test("a rejected token is dropped instead of resent forever", async () => {
	expect(await dropped).toBeUndefined();
	if (client.authenticated.peek()) await client.authenticated.changed();
	expect(requests.some((r) => r.url.endsWith("/account/info"))).toBe(true);
	expect(Settings.oauth.token.peek()).toBeUndefined();
	expect(client.authenticated.peek()).toBe(false);
});

test("login sends only a challenge and redeems the code with the matching verifier", async () => {
	infoStatus = 200;
	await client.loginStart("google", "https://hang.test/room");
	const verifier = Settings.oauth.verifier.peek();
	expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

	const login = new URL(requests.findLast((r) => r.url.includes("/auth/google/login"))?.url ?? "");
	expect(login.searchParams.get("challenge")).toBe(await oauthChallenge(verifier ?? ""));
	// The verifier itself never leaves the client before the exchange.
	expect(requests.some((r) => r.url.includes(verifier ?? ""))).toBe(false);

	await client.loginComplete("good");
	const exchange = requests.findLast((r) => r.url.endsWith("/auth/token"));
	expect(JSON.parse(exchange?.body ?? "{}")).toEqual({ code: "good", verifier });
	expect(Settings.oauth.token.peek()).toBe("session");
	expect(Settings.oauth.verifier.peek()).toBeUndefined();
});

test("a code is refused without a login in progress, and a failed exchange is not retried", async () => {
	await expect(client.loginComplete("good")).rejects.toThrow("No login in progress");

	await client.loginStart("google", "https://hang.test/room");
	await expect(client.loginComplete("bad")).rejects.toThrow("Login failed");
	expect(Settings.oauth.verifier.peek()).toBeUndefined();
});
