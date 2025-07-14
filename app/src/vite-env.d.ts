/// <reference types="vite/client" />

interface ViteTypeOptions {
	// By adding this line, you can make the type of ImportMetaEnv strict
	// to disallow unknown keys.
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_RELAY_HOST: string;
	readonly VITE_ROOM: string;
	readonly VITE_API_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
