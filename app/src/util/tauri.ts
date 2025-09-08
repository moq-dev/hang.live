// Only export the Tauri API if we're in a Tauri environment
// TODO Verify if this actually works.
import * as Tauri from "@tauri-apps/api";
export default __TAURI__
	? Tauri
	: {
			app: undefined,
			core: undefined,
			dpi: undefined,
			event: undefined,
			image: undefined,
			menu: undefined,
			mocks: undefined,
			path: undefined,
			tray: undefined,
			webview: undefined,
			webviewWindow: undefined,
			window: undefined,
		};

if (__TAURI__) {
	Tauri.app
		.getName()
		.then((name) => {
			console.log("Tauri app loaded:", name);
		})
		.catch((_) => {
			console.error("Tauri not found; is this running in a browser?");
		});
}
