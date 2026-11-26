import * as OAuth from "@fabianlars/tauri-plugin-oauth";
import * as DeepLink from "@tauri-apps/plugin-deep-link";

/** Converts a `hang://` deep link or localhost OAuth URL into a same-origin path, or throws if it would leave the app. */
export function redirect(url: string, origin: string): string {
	const parsed = new URL(url);

	// `hang://oauth/home` parses `oauth` as the host, so put it back in front of the path.
	let path: string;
	if (parsed.protocol === "hang:") {
		path = `/${parsed.host}${parsed.pathname}`;
	} else if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
		path = parsed.pathname;
	} else {
		throw new Error(`unsupported deep link: ${parsed.protocol}//${parsed.host}`);
	}

	// Resolve against our origin, then check the normalized result: dot segments can turn `/a/..//x` into `//x`,
	// which the browser would treat as another host.
	// Compare protocol and host, since `tauri://localhost` has an opaque "null" origin.
	const base = new URL(origin);
	const resolved = new URL(`${path}${parsed.search}`, base);
	const out = `${resolved.pathname}${resolved.search}`;
	const escapes = (p: string) => !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\");
	if (resolved.protocol !== base.protocol || resolved.host !== base.host || escapes(path) || escapes(out)) {
		throw new Error(`deep link escapes the app: ${path}`);
	}

	return out;
}

// Digest of the last followed link, so getCurrent() doesn't replay it after our hard redirect reloads the page.
// A digest rather than the URL, since OAuth links carry a bearer token.
const HANDLED_KEY = "hang.deep_link.handled";

async function digest(url: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function load(url: string | undefined, replay = false) {
	if (url === undefined) return;

	const handled = await digest(url);
	if (replay && sessionStorage.getItem(HANDLED_KEY) === handled) return;

	let path: string;
	try {
		path = redirect(url, window.location.origin);
	} catch (error) {
		console.error("ignoring deep link:", error);
		return;
	}

	sessionStorage.setItem(HANDLED_KEY, handled);

	// A hard redirect, since the SolidJS router doesn't observe history API changes.
	window.location.href = path;
}

export async function start(): Promise<number | undefined> {
	// Live events are always followed, even when the same link is opened again.
	await DeepLink.onOpenUrl((urls) => void load(urls.at(0)));

	// getCurrent() keeps returning the launch or latest link for the app's lifetime.
	await load((await DeepLink.getCurrent())?.at(0), true);

	// Start the OAuth server so we can receive localhost redirects
	try {
		const port = await OAuth.start();

		// Handle any redirects.
		await OAuth.onUrl((url) => void load(url));

		return port;
	} catch (error) {
		console.error("failed starting OAuth server:", error);
	}

	return undefined;
}
