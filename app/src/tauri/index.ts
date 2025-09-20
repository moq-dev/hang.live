export const ENABLED = !!import.meta.env.TAURI_ENV_PLATFORM && "__TAURI_INTERNALS__" in window;

export const MOBILE =
	ENABLED && (import.meta.env.TAURI_ENV_PLATFORM === "android" || import.meta.env.TAURI_ENV_PLATFORM === "ios");
export const DESKTOP =
	ENABLED &&
	(import.meta.env.TAURI_ENV_PLATFORM === "linux" ||
		import.meta.env.TAURI_ENV_PLATFORM === "windows" ||
		import.meta.env.TAURI_ENV_PLATFORM === "darwin");
export const ANDROID = ENABLED && import.meta.env.TAURI_ENV_PLATFORM === "android";
export const IOS = ENABLED && import.meta.env.TAURI_ENV_PLATFORM === "ios";
export const LINUX = ENABLED && import.meta.env.TAURI_ENV_PLATFORM === "linux";
export const WINDOWS = ENABLED && import.meta.env.TAURI_ENV_PLATFORM === "windows";
export const MACOS = ENABLED && import.meta.env.TAURI_ENV_PLATFORM === "darwin";

// Only load/export the Tauri modules if we're in a Tauri environment
export const Api = ENABLED ? await import("@tauri-apps/api") : null;
export const Opener = ENABLED ? await import("@tauri-apps/plugin-opener") : null;
