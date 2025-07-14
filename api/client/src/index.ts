import type * as Api from "@hang/api-server";

export type * from "@hang/api-server";
export * from "@hang/api-server/client";
export * as OAuth from "./oauth";

import { hc } from "hono/client";

export class Client {
	routes: ReturnType<typeof hc<Api.App>>;
	#token: string | null;

	constructor(baseUrl: URL) {
		const url = new URL(window.location.href);
		this.#token = url.searchParams.get("token");
		if (this.#token) {
			// Remove token from URL
			url.searchParams.delete("token");
			// Update URL without the token
			window.history.replaceState({}, "", url.toString());

			localStorage.setItem("auth.token", this.#token);
		} else {
			this.#token = localStorage.getItem("auth.token");
		}

		const headers: Record<string, string> = this.#token ? { Authorization: `Bearer ${this.#token}` } : {};
		this.routes = hc<Api.App>(baseUrl.toString(), { headers });
	}

	authenticated(): boolean {
		return this.#token !== null;
	}

	async logout(): Promise<void> {
		localStorage.removeItem("auth.token");
		window.location.reload();
	}
}
