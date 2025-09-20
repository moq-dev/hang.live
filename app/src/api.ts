// The `type` keyword is VERY important here
import type * as Api from "@hang/api";
import { hc } from "hono/client";
import * as Url from "./util/url";

export type * from "@hang/api";
export * from "@hang/api/client";

import { Effect, Signal } from "@kixelated/signals";
import Settings from "./settings";
import * as Tauri from "./tauri";

export class Client {
	// TODO Make two separate routes for authenticated and unauthenticated.
	routes: ReturnType<typeof hc<Api.App>>;

	#authenticated: Signal<boolean>;

	// If a port is provided, then redirect to localhost:port.
	#redirectPort?: Promise<number | undefined>;

	signals = new Effect();

	constructor() {
		const url = Url.rewrite(import.meta.env.VITE_API_URL);

		if (Tauri.ENABLED) {
			// Kinda awkard that we load tauri deep link handling here.
			// TODO Split into two parts?
			this.#redirectPort = import("./tauri/deep_link").then((module) => module.start());
		}

		const token = Settings.oauth.token.peek();

		this.#authenticated = new Signal(!!token);
		const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
		this.routes = hc<Api.App>(url.toString(), { headers });

		this.signals.effect((effect: Effect) => {
			// TODO async verify the token is valid
			const token = effect.get(Settings.oauth.token);
			this.#authenticated.set(!!token);

			// Annoying duplication, but I don't want to leave this.routes uninitialized.
			const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
			this.routes = hc<Api.App>(url.toString(), { headers });
		});

		this.signals.effect((effect) => {
			const authenticated = effect.get(this.#authenticated);
			if (!authenticated) return;

			effect.spawn(async () => {
				const response = await this.routes.account.info.$get();
				if (!response.ok) {
					console.error(`Failed to get info: ${response.statusText}`);
					return;
				}

				const info = await response.json();
				Settings.account.name.set(info.name);
				Settings.account.avatar.set(info.avatar);
			});
		});
	}

	get authenticated(): Signal<boolean> {
		return this.#authenticated;
	}

	// NOTE: Returns when the login is started, not when it's finished.
	// callback() has to be called to finish the login.
	async loginStart(provider: Api.OAuth.ProviderId, url = window.location.href) {
		// Okay this is super annoying.
		// - Google doesn't support hang:// redirect URLs.
		// - Apple doesn't support http://localhost redirects
		//
		// My hack is to instead redirect to https://hang.live/oauth/<path>?token=<jwt>
		// OR on desktop platforms, to hang://oauth/<path>?token=<jwt>
		// Mobile platforms will open the app when https://hang.live is visited.
		//
		// The /oauth prefix is removed and the token is grabbed from the query params.
		//
		// NOTE: pathname starts with a slash.
		const parts = new URL(url);

		const redirectPort = await this.#redirectPort;

		let redirect: string;
		if (redirectPort) {
			// Use a localhost server to handle the redirect.
			// This works for local development and doesn't prompt the user.
			redirect = `http://localhost:${redirectPort}/oauth${parts.pathname}`;
		} else if (Tauri.DESKTOP) {
			// As a fallback, use the deep-link handler.
			// For some reason, Javascript won't let me set URL.protocol to hang://
			redirect = `hang://oauth${parts.pathname}`;
		} else {
			// For web clients, just redirect to our current URL with the oauth prefix.
			parts.pathname = `/oauth${parts.pathname}`;
			redirect = parts.toString();
		}

		// We encode this random string which gets echoed back to us in the OAuth callback.
		// If the random is different, then something sus is happening.
		// TODO Use a more secure random string.
		const random = Math.random().toString(36).substring(2, 15);

		Settings.oauth.token.set(undefined);
		Settings.oauth.random.set(random);

		// Fetch the OAuth URL from the API
		const response = await this.routes.auth[":provider"].login.$get({
			param: {
				provider,
			},
			query: {
				random,
				redirect: redirect.toString(),
			},
		});

		const data = await response.json();

		if (Tauri.Opener) {
			await Tauri.Opener.openUrl(data.url);
		} else {
			window.location.href = data.url;
		}
	}

	// Parses the OAuth token out of the URL.
	loginComplete(token: string, random: string) {
		const url = new URL(window.location.href);

		if (random !== Settings.oauth.random.peek()) {
			Settings.oauth.random.set(undefined); // Clear so we can't try again
			throw new Error("Incorrect random in OAuth callback");
		}

		// MUST be after random check.
		Settings.oauth.token.set(token);
		Settings.oauth.random.set(undefined);

		// Remove token and state from URL
		url.searchParams.delete("token");
		url.searchParams.delete("random");
	}

	async logout(): Promise<void> {
		Settings.oauth.token.set(undefined);
		Settings.oauth.random.set(undefined);
	}
}

export const client = new Client();
