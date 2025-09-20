import * as Tauri from "./index.ts";

await Tauri.DeepLink?.onOpenUrl((urls) => {
	console.log("deep link:", urls);
});
