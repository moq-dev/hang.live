/// <reference types="vite/client" />

interface ViteTypeOptions {
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_RELAY_URL: string;
}

// Define Tauri-specific environment variables
interface TauriImportMetaEnv {
	readonly TAURI_ENV_PLATFORM: "windows" | "darwin" | "linux" | "android" | "ios" | undefined;
	readonly TAURI_ENV_ARCH: string | undefined;
	readonly TAURI_ENV_FAMILY: "unix" | "windows" | undefined;
	readonly TAURI_ENV_PLATFORM_VERSION: string | undefined;
	readonly TAURI_ENV_PLATFORM_TYPE: string | undefined;
	readonly TAURI_ENV_DEBUG: boolean | undefined;
}

// True if we're in a Tauri environment
declare const TAURI: boolean;

interface ImportMeta {
	readonly env: ImportMetaEnv & TauriImportMetaEnv;
}
