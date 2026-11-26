// The `type` keyword is VERY important here
import type * as Api from "@hang/api";
import { hc } from "hono/client";

export type * from "@hang/api";
export * from "@hang/api/client";

import { Effect, Signal } from "@moq/signals";
import Settings from "./settings";

export class Client {
	// TODO Make two separate routes for authenticated and unauthenticated.
	routes: ReturnType<typeof hc<Api.App>>;

	#authenticated: Signal<boolean>;

	signals = new Effect();

	constructor() {
		const token = Settings.oauth.token.peek();

		this.#authenticated = new Signal(!!token);
		const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
		this.routes = hc<Api.App>(import.meta.env.VITE_API_URL, { headers });

		this.signals.run((effect: Effect) => {
			// TODO async verify the token is valid
			const token = effect.get(Settings.oauth.token);
			this.#authenticated.set(!!token);

			// Annoying duplication, but I don't want to leave this.routes uninitialized.
			const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
			this.routes = hc<Api.App>(import.meta.env.VITE_API_URL, { headers });
		});

		this.signals.run((effect) => {
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
		// Redirect back to the current URL with an /oauth prefix, which the Oauth route strips.
		// NOTE: pathname starts with a slash.
		const parts = new URL(url);
		parts.pathname = `/oauth${parts.pathname}`;
		const redirect = parts.toString();

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
				redirect,
			},
		});

		const data = await response.json();

		window.location.href = data.url;
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
		Settings.clear();
	}
}

export const client = new Client();
