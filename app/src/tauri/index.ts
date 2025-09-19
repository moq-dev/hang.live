export const MOBILE = import.meta.env.TAURI_ENV_PLATFORM === "android" || import.meta.env.TAURI_ENV_PLATFORM === "ios";
export const DESKTOP =
	import.meta.env.TAURI_ENV_PLATFORM === "linux" ||
	import.meta.env.TAURI_ENV_PLATFORM === "windows" ||
	import.meta.env.TAURI_ENV_PLATFORM === "darwin";
export const ANDROID = import.meta.env.TAURI_ENV_PLATFORM === "android";
export const IOS = import.meta.env.TAURI_ENV_PLATFORM === "ios";
export const LINUX = import.meta.env.TAURI_ENV_PLATFORM === "linux";
export const WINDOWS = import.meta.env.TAURI_ENV_PLATFORM === "windows";
export const MACOS = import.meta.env.TAURI_ENV_PLATFORM === "darwin";
export const ENABLED = !!import.meta.env.TAURI_ENV_PLATFORM;

// Only export the Tauri modules if we're in a Tauri environment
export const Api = ENABLED ? await import("@tauri-apps/api") : null;
export const Process = ENABLED ? await import("@tauri-apps/plugin-process") : null;
export const Updater = ENABLED ? await import("@tauri-apps/plugin-updater") : null;
