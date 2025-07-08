import { Computed, Root, Signal } from "@kixelated/signals";
import { z } from "zod/v4-mini";
import { AuthProviders } from ".";
import { Schema, schema } from "./schema";

const AuthProvidersSchema = schema<AuthProviders>()({
	names: z.array(z.string()),
});

export interface ClientConfig {
	url: URL;
}

export class Client {
	token = new Signal<string | null>(null);
	authenticated: Computed<boolean>;

	#config: ClientConfig;
	#signals = new Root();

	constructor(config: ClientConfig) {
		this.#config = config;

		const urlParams = new URLSearchParams(window.location.search);

		let tokenParam = urlParams.get("token");


		console.log("tokenParam", tokenParam);
		if (tokenParam) {
			// Check if we have a stored redirect path from before OAuth
			const path = localStorage.getItem("auth.redirect") || window.location.pathname;

			console.log("redirect path", path);

			// Clear the redirect path
			localStorage.removeItem("auth.redirect");

			// Navigate to the redirect path using SPA navigation
			window.history.replaceState({}, document.title, path);

			// Is this needed?
			//window.dispatchEvent(new PopStateEvent("popstate"));
		} else {
			tokenParam = localStorage.getItem("auth.token") ?? null;
		}

		this.token.set(tokenParam);
		this.authenticated = this.#signals.computed((effect) => !!effect.get(this.token));

		this.#signals.effect((effect) => {
			const token = effect.get(this.token);

			if (token) {
				localStorage.setItem("auth.token", token);
			} else {
				localStorage.removeItem("auth.token");
			}
		});
	}

	async providers(): Promise<AuthProviders> {
		return await this.get("/auth/providers", AuthProvidersSchema);
	}

	// Start the OAuth login flow for the given provider
	login(provider: string) {
		// Store the current path to redirect back to after OAuth
		localStorage.setItem("auth.redirect", window.location.pathname);

		console.log("saving redirect path", window.location.pathname);

		// Redirect to the OAuth provider
		window.location.href = new URL(`auth/${provider}`, this.#config.url).toString();
	}

	async logout() {
		this.token.set(null);
	}

	close() {
		this.#signals.close();
	}

	// Helper method to make authenticated requests with optional response validation
	async fetch(path: string, options: RequestInit = {}): Promise<Response> {
		const headers = {
			...options.headers,
			Authorization: this.token.peek() ? `Bearer ${this.token.peek()}` : "",
		};

		const url = new URL(path, this.#config.url);
		return fetch(url, { ...options, headers });
	}

	async post<R, W>(
		path: string,
		request: R,
		requestSchema: Schema<R>,
		response: Schema<W>,
	): Promise<W> {
		// Make sure the request is valid first
		const requestResult = requestSchema.safeParse(request);
		if (!requestResult.success) {
			throw new Error(`Invalid request: ${requestResult.error.message}`);
		}

		const options: RequestInit = { method: "POST" };

		// If request is provided, encode it into the body
		if (request !== null && request !== undefined) {
			options.headers = {
				"Content-Type": "application/json",
			};
			options.body = JSON.stringify(request);
		}

		const http = await this.fetch(path, options);
		if (!http.ok) {
			throw new Error(`HTTP ${http.status}: ${http.statusText}`);
		}

		// Parse and validate the response
		const data = await http.json();
		return this.#parseResponse(response, data);
	}

	async get<T>(
		path: string,
		response: Schema<T>,
	): Promise<T> {
		const http = await this.fetch(path);

		if (!http.ok) {
			throw new Error(`HTTP ${http.status}: ${http.statusText}`);
		}

		const data = await http.json();
		return this.#parseResponse(response, data);
	}

	#parseResponse<T>(schema: Schema<T>, data: unknown): T {
		const result = schema.safeParse(data);
		if (!result.success) {
			throw new Error(`Invalid API response: ${result.error.message}`);
		}
		return result.data as T;
	}
}
