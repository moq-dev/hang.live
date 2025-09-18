// Rewrite the URL to handle localhost addresses on Android emulators.
export function rewrite(url: string | URL): URL {
	const u = typeof url === "string" ? new URL(url) : url;

	if (import.meta.env.TAURI_ENV_DEBUG && import.meta.env.TAURI_ENV_PLATFORM === "android") {
		// Android emulators use 10.0.2.2 as the localhost address.
		u.hostname = u.hostname.replace("localhost", "10.0.2.2");
	}

	return u;
}
