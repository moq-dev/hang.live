import { hc } from "hono/client";
import type * as Api from "..";

export type * from "..";
export * as Room from "../room";

import { oauthStateSchema } from "../shared";

export * from "../shared";

export class Client {
	routes: ReturnType<typeof hc<Api.App>>;
	#token: string | null;

	constructor(baseUrl: URL) {
		const url = new URL(window.location.href);
		const token = url.searchParams.get("token");
		const state = url.searchParams.get("state");

		// Remove token and state from URL
		url.searchParams.delete("token");
		url.searchParams.delete("state");

		// Update URL without the token
		window.history.replaceState({}, "", url.toString());

		if (token && state && state === localStorage.getItem("auth.state")) {
			const parsedState = oauthStateSchema.parse(JSON.parse(state));
			localStorage.setItem("auth.token", token);

			if (parsedState.redirectUrl) {
				// Redirect to the original page.
				window.history.replaceState({}, "", parsedState.redirectUrl);
			}

			this.#token = token;
		} else {
			this.#token = localStorage.getItem("auth.token");
		}

		const headers: Record<string, string> = this.#token ? { Authorization: `Bearer ${this.#token}` } : {};
		this.routes = hc<Api.App>(baseUrl.toString(), { headers });
	}

	authenticated(): boolean {
		return this.#token !== null;
	}

	async login(provider: Api.OAuth.ProviderId): Promise<void> {
		const state = {
			random: Math.random().toString(36).substring(2, 15),
			redirectUrl: window.location.href,
		};

		localStorage.setItem("auth.state", JSON.stringify(state));

		// Fetch the OAuth URL from the API
		const response = await this.routes.auth[":provider"].login.$get({
			param: {
				provider,
			},
			query: state,
		});

		const data = await response.json();

		// Navigate to the OAuth provider
		window.location.href = data.url;
	}

	async logout(): Promise<void> {
		localStorage.removeItem("auth.token");
		window.location.reload();
	}
}
