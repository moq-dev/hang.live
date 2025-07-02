import { Computed, Root, Signal } from "@kixelated/signals";

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	avatar_url?: string;
	created_at: string;
}

export interface AuthResponse {
	user: AuthUser;
	token: string;
}

export interface AuthConfig {
	apiUrl: string;
}

export class Auth {
	token: Signal<string | null>;
	user: Signal<AuthUser | null>;
	authenticated: Computed<boolean>;

	#config: AuthConfig;
	#signals = new Root();

	constructor(config: AuthConfig) {
		this.#config = config;

		const urlParams = new URLSearchParams(window.location.search);

		let tokenParam = urlParams.get("token");
		let userParam = urlParams.get("user");

		if (tokenParam && userParam) {
			userParam = decodeURIComponent(userParam);
			window.history.replaceState({}, document.title, window.location.pathname);
		} else {
			tokenParam = localStorage.getItem("auth.token") ?? null;
			userParam = localStorage.getItem("auth.user") ?? null;
		}

		try {
			this.token = new Signal(tokenParam);
			this.user = new Signal(userParam ? JSON.parse(userParam) : null);
		} catch (e) {
			this.logout(); // clear the saved state on error
			throw e;
		}

		// Update local storage when the token/user changes
		this.#signals.effect((effect) => {
			const token = effect.get(this.token);
			const user = effect.get(this.user);

			if (token && user) {
				localStorage.setItem("auth.token", token);
				localStorage.setItem("auth.user", JSON.stringify(user));
			} else {
				localStorage.removeItem("auth.token");
				localStorage.removeItem("auth.user");
			}
		});

		this.authenticated = this.#signals.computed(() => !!this.token.peek() && !!this.user.peek());
	}

	async providers(): Promise<string[]> {
		const response = await fetch(`${this.#config.apiUrl}/auth/providers`);
		if (!response.ok) {
			throw new Error("Failed to fetch OAuth providers");
		}
		const data = await response.json();
		return data.providers;
	}

	// Start the OAuth login flow for the given provider
	login(provider: string) {
		// Redirect to the OAuth provider
		window.location.href = `${this.#config.apiUrl}/auth/${provider}`;
	}

	logout() {
		// Optionally call the logout endpoint
		if (this.token.peek()) {
			this.fetch(`${this.#config.apiUrl}/auth/logout`, {
				method: "POST",
			}).catch(console.error);
		}

		this.token.set(null);
		this.user.set(null);
	}

	close() {
		this.#signals.close();
	}

	// Helper method to make authenticated requests
	async fetch(url: string, options: RequestInit = {}): Promise<Response> {
		const token = this.token.peek();
		if (!token) {
			throw new Error("Not authenticated");
		}

		const headers = {
			...options.headers,
			Authorization: `Bearer ${token}`,
		};

		return fetch(url, { ...options, headers });
	}
}
