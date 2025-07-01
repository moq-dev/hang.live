export interface User {
	id: string;
	email: string;
	name: string;
	avatar_url?: string;
	created_at: string;
}

export interface AuthResponse {
	user: User;
	token: string;
}

export interface Provider {
	name: string;
}

export class AuthService {
	private baseUrl: string;
	private token: string | null = null;
	private user: User | null = null;

	constructor(baseUrl = "http://localhost:3000") {
		this.baseUrl = baseUrl;
		this.loadFromStorage();
	}

	private loadFromStorage() {
		this.token = localStorage.getItem("auth.token");
		const userStr = localStorage.getItem("auth.user");
		if (userStr) {
			try {
				this.user = JSON.parse(userStr);
			} catch (e) {
				console.error("Failed to parse stored user data:", e);
				this.clearAuth();
			}
		}
	}

	private saveToStorage() {
		if (this.token) {
			localStorage.setItem("auth.token", this.token);
		} else {
			localStorage.removeItem("auth.token");
		}

		if (this.user) {
			localStorage.setItem("auth.user", JSON.stringify(this.user));
		} else {
			localStorage.removeItem("auth.user");
		}
	}

	private clearAuth() {
		this.token = null;
		this.user = null;
		localStorage.removeItem("auth.token");
		localStorage.removeItem("auth.user");
	}

	async getProviders(): Promise<Provider[]> {
		const response = await fetch(`${this.baseUrl}/auth/providers`);
		if (!response.ok) {
			throw new Error("Failed to fetch OAuth providers");
		}
		const data = await response.json();
		return data.providers;
	}

	initiateOAuth(provider: string) {
		// Redirect to the OAuth provider
		window.location.href = `${this.baseUrl}/auth/${provider}`;
	}

	// Handle OAuth callback (this would be called after redirect)
	async handleOAuthCallback(): Promise<boolean> {
		const urlParams = new URLSearchParams(window.location.search);
		const token = urlParams.get("token");
		const userParam = urlParams.get("user");

		if (token && userParam) {
			try {
				this.token = token;
				this.user = JSON.parse(decodeURIComponent(userParam));
				this.saveToStorage();

				// Clean up URL
				window.history.replaceState({}, document.title, window.location.pathname);
				return true;
			} catch (e) {
				console.error("Failed to handle OAuth callback:", e);
				return false;
			}
		}
		return false;
	}

	logout() {
		this.clearAuth();

		// Optionally call the logout endpoint
		if (this.token) {
			fetch(`${this.baseUrl}/auth/logout`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			}).catch(console.error);
		}
	}

	isAuthenticated(): boolean {
		return !!(this.token && this.user);
	}

	getUser(): User | null {
		return this.user;
	}

	getToken(): string | null {
		return this.token;
	}

	// Helper method to make authenticated requests
	async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
		if (!this.token) {
			throw new Error("Not authenticated");
		}

		const headers = {
			...options.headers,
			Authorization: `Bearer ${this.token}`,
		};

		return fetch(url, { ...options, headers });
	}
}

// Create a global auth service instance
export const authService = new AuthService();
