// Only export the Tauri API if we're in a Tauri environment
export default import.meta.env.TAURI_ENV_PLATFORM ? await import("@tauri-apps/api") : null;
