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

	// Resolve against our origin so `//evil.com` or `/\\evil.com` can't escape it.
	const resolved = new URL(`${path}${parsed.search}`, origin);
	if (resolved.origin !== new URL(origin).origin || !path.startsWith("/") || path.startsWith("//")) {
		throw new Error(`deep link escapes the app: ${path}`);
	}

	return `${resolved.pathname}${resolved.search}`;
}

function load(urls: string[] | null) {
	const url = urls?.at(0);
	if (url === undefined) return;

	let path: string;
	try {
		path = redirect(url, window.location.origin);
	} catch (error) {
		console.error("ignoring deep link:", error);
		return;
	}

	// SolidJS router sucks, so we use the browser's history API instead
	// TODO SolidJS sucks even more and doesn't listen to the history API.
	//window.history.pushState(null, "", redirect);

	// So just do a hard redirect, fuck solid.
	window.location.href = path;
}

export async function start(): Promise<number | undefined> {
	// Register the deep link handler
	await DeepLink.onOpenUrl(load);

	// Check if there is a deep link to handle.
	const current = await DeepLink.getCurrent();
	load(current);

	// Start the OAuth server so we can receive localhost redirects
	try {
		const port = await OAuth.start();

		// Handle any redirects.
		await OAuth.onUrl((url) => load([url]));

		return port;
	} catch (error) {
		console.error("failed starting OAuth server:", error);
	}

	return undefined;
}
