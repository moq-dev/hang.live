/// <reference types="vite/client" />

// biome-ignore lint/correctness/noUnusedVariables: Used by Vite
interface ViteTypeOptions {
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_APP_URL: string;
	readonly VITE_RELAY_URL: string;
}

// biome-ignore lint/correctness/noUnusedVariables: Used by Vite
interface ImportMeta {
	readonly env: ImportMetaEnv;
}
