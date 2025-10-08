import { ENABLED } from "./constants";
// Only load/export the Tauri modules if we're in a Tauri environment
export const Api = ENABLED ? await import("@tauri-apps/api") : null;
export const Opener = ENABLED ? await import("@tauri-apps/plugin-opener") : null;
export * from "./constants";
