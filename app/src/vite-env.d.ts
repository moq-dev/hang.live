/// <reference types="vite/client" />

interface ViteTypeOptions {
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_APP_URL: string;
	readonly NODE_ENV?: string;
	readonly MODE?: string;
	readonly DEV?: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
