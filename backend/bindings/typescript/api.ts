// API types matching the Rust backend
export interface User {
	id: string;
	email: string;
	name: string;
	avatar_url?: string;
	created_at: string;
}

export interface Room {
	id: string;
	name: string;
	description?: string;
	owner_id: string;
	is_public: boolean;
	created_at: string;
	member_count?: number;
}

export interface RoomMember {
	user: User;
	role: string;
	joined_at: string;
}

export interface RoomDetail {
	room: Room;
	members: RoomMember[];
	is_member: boolean;
	user_role?: string;
}

export interface AuthResponse {
	user: User;
	token: string;
}

export interface RoomToken {
	token: string;
	expires_in: number;
}

export interface UploadUrl {
	upload_url: string;
	file_url: string;
}

export interface ProviderInfo {
	name: string;
}

export interface ProvidersResponse {
	providers: ProviderInfo[];
}

// Request types
export interface CreateRoomRequest {
	name: string;
	description?: string;
	is_public: boolean;
}

export interface UpdateUserRequest {
	name?: string;
}

export interface CreateRoomTokenRequest {
	room_id: string;
	expires_in_minutes?: number;
}

// API Client
export class HangApiClient {
	private baseUrl: string;
	private token?: string;

	constructor(baseUrl = "http://localhost:3001") {
		this.baseUrl = baseUrl;
	}

	setToken(token: string) {
		this.token = token;
	}

	isAuthenticated(): boolean {
		return !!this.token;
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...(options.headers as Record<string, string>),
		};

		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		const response = await fetch(url, {
			...options,
			headers,
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`API Error: ${response.status} - ${error}`);
		}

		return response.json();
	}

	// Health check
	async health() {
		return this.request<{ status: string; timestamp: string; version: string }>("/health");
	}

	// Authentication
	getAuthUrl(provider: string): string {
		return `${this.baseUrl}/auth/${provider}`;
	}

	async getAvailableProviders(): Promise<ProviderInfo[]> {
		const response = await this.request<ProvidersResponse>("/auth/providers");
		return response.providers;
	}

	// Users
	async getCurrentUser(): Promise<User> {
		return this.request<User>("/users/me");
	}

	async updateCurrentUser(update: UpdateUserRequest): Promise<User> {
		return this.request<User>("/users/me", {
			method: "PATCH",
			body: JSON.stringify(update),
		});
	}

	async getUser(id: string): Promise<User> {
		return this.request<User>(`/users/${id}`);
	}

	// Rooms
	async listRooms(page = 1, limit = 20): Promise<Room[]> {
		return this.request<Room[]>(`/rooms?page=${page}&limit=${limit}`);
	}

	async createRoom(room: CreateRoomRequest): Promise<Room> {
		return this.request<Room>("/rooms", {
			method: "POST",
			body: JSON.stringify(room),
		});
	}

	async getRoom(id: string): Promise<RoomDetail> {
		return this.request<RoomDetail>(`/rooms/${id}`);
	}

	async joinRoom(id: string): Promise<RoomDetail> {
		return this.request<RoomDetail>(`/rooms/${id}/join`, {
			method: "POST",
		});
	}

	async leaveRoom(id: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/rooms/${id}/leave`, {
			method: "DELETE",
		});
	}

	async createRoomToken(request: CreateRoomTokenRequest): Promise<RoomToken> {
		return this.request<RoomToken>(`/rooms/${request.room_id}/token`, {
			method: "POST",
			body: JSON.stringify(request),
		});
	}

	async getMyRooms(): Promise<Room[]> {
		return this.request<Room[]>("/rooms/my");
	}

	// Avatars
	async uploadAvatar(file: File): Promise<{ message: string; avatar_url: string }> {
		const formData = new FormData();
		formData.append("avatar", file);

		const headers: Record<string, string> = {};
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		const response = await fetch(`${this.baseUrl}/avatars/upload`, {
			method: "POST",
			headers,
			body: formData,
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Upload Error: ${response.status} - ${error}`);
		}

		return response.json();
	}

	async getUploadUrl(): Promise<UploadUrl> {
		return this.request<UploadUrl>("/avatars/upload-url");
	}
}

// Error types
export class ApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public response?: Response,
	) {
		super(message);
		this.name = "ApiError";
	}
}

// Helper functions
export function isAuthenticated(client: HangApiClient): boolean {
	return client.isAuthenticated();
}

export function createAuthenticatedClient(baseUrl: string, token: string): HangApiClient {
	const client = new HangApiClient(baseUrl);
	client.setToken(token);
	return client;
}
