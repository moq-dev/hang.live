import type * as Api from "@hang/api-server";
import { oauthStateSchema } from "@hang/api-server/client";

export type * from "@hang/api-server";
export * from "@hang/api-server/client";

import { hc } from "hono/client";

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

	login(provider: Api.OAuth.ProviderId): void {
		const state = {
			random: Math.random().toString(36).substring(2, 15),
			redirectUrl: window.location.href,
		};

		localStorage.setItem("auth.state", JSON.stringify(state));

		// Redirect to the login page.
		// TODO save the redirect URL in the URL params.
		window.location.href = this.routes.auth[":provider"].login.$url({
			param: {
				provider,
			},
			query: state,
		}).toString();
	}

	async logout(): Promise<void> {
		localStorage.removeItem("auth.token");
		window.location.reload();
	}
}
