/// <reference types="vite/client" />

interface ViteTypeOptions {
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_APP_URL: string;
	// The R2 bucket the API serves avatars from, the only other origin peer avatars may load from.
	readonly VITE_PUBLIC_URL: string;
	readonly NODE_ENV?: string;
	readonly MODE?: string;
	readonly DEV?: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
