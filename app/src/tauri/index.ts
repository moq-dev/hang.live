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
