// The `type` keyword is VERY important here
import type * as Api from "@hang/api";
import { oauthChallenge, oauthVerifier } from "@hang/api/client";
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
				// Auth middleware's 401 is missing from the RPC's inferred statuses.
				const status: number = response.status;
				if (status === 401) {
					// The token expired or was revoked: drop it rather than keep sending it.
					Settings.oauth.token.set(undefined);
					return;
				}
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

		// Only this client knows the verifier; the API mints a code that only it can redeem.
		const verifier = oauthVerifier();

		Settings.oauth.token.set(undefined);
		Settings.oauth.verifier.set(verifier);

		// Fetch the OAuth URL from the API
		const response = await this.routes.auth[":provider"].login.$get({
			param: {
				provider,
			},
			query: {
				challenge: await oauthChallenge(verifier),
				redirect,
			},
		});
		if (!response.ok) {
			throw new Error(`Failed to start login: ${response.statusText}`);
		}

		const data = await response.json();

		window.location.href = data.url;
	}

	// Redeem the code from the OAuth redirect for a session token.
	async loginComplete(code: string) {
		const verifier = Settings.oauth.verifier.peek();
		// Single use, even if the exchange fails.
		Settings.oauth.verifier.set(undefined);
		if (!verifier) throw new Error("No login in progress");

		const response = await this.routes.auth.token.$post({ json: { code, verifier } });
		if (!response.ok) throw new Error(`Login failed: ${response.statusText}`);

		const { token } = await response.json();
		Settings.oauth.token.set(token);
	}

	async logout(): Promise<void> {
		Settings.logout();
	}
}

export const client = new Client();
