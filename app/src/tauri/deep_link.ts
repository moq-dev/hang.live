import * as OAuth from "@fabianlars/tauri-plugin-oauth";
import * as DeepLink from "@tauri-apps/plugin-deep-link";

function load(urls: string[] | null) {
	const url = urls?.at(0);
	if (url === undefined) return;

	const parsed = new URL(url);
	const redirect = `${parsed.pathname}${parsed.search}`;

	// SolidJS router sucks, so we use the browser's history API instead
	// TODO SolidJS sucks even more and doesn't listen to the history API.
	//window.history.pushState(null, "", redirect);

	// So just do a hard redirect, fuck solid.
	window.location.href = redirect;
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
