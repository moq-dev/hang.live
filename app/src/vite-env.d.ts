/// <reference types="vite/client" />

interface ViteTypeOptions {
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_APP_URL: string;
	readonly VITE_RELAY_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
