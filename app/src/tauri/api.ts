// Only export the Tauri API if we're in a Tauri environment
export default __TAURI__ ? await import("@tauri-apps/api") : null;
