import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		target: "esnext",
		sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
		rollupOptions: {
			input: "index.html",
			// Optional: Make sure we never bundle Tauri packages just in case tree-shaking doesn't work.
			external: process.env.TAURI_ENV_PLATFORM ? [] : [/^@tauri-apps\//],
		},
	},
	optimizeDeps: {
		exclude: ["@libav.js/variant-opus-af"],
	},

	worker: {
		format: "es" as const,
	},

	plugins: [
		solid(),
		tailwindcss(),
		viteStaticCopy({
			targets: [
				// We copy onnxruntime-web locally so it gets bundled with the app, not downloaded at runtime.
				{
					src: "../node_modules/onnxruntime-web/dist/*",
					dest: "models/onnxruntime-web",
				},
				// We copy the version files otherwise Vite yells at us importing JSON modules.
				{
					src: "src/version/*",
					dest: "version",
				},
			],
		}),
	],

	resolve: {
		dedupe: ["solid-js"],
	},

	// prevent vite from obscuring rust errors
	clearScreen: false,
	server: {
		port: 1420,
		// Open the web browser if we're not using Tauri.
		open: !process.env.TAURI_ENV_PLATFORM,
		strictPort: true,
		host: process.env.TAURI_DEV_HOST || false,
		hmr: false,
		fs: {
			allow: [
				".",
				// Allow access to parent node_modules for workspace dependencies
				path.resolve("../node_modules"),
				// Allow fetching MoQ workers and worklets
				path.resolve("../moq"),
			],
		},
	},
	// Env variables starting with the item of `envPrefix` will be exposed in tauri's source code through `import.meta.env`.
	envPrefix: ["VITE_", "TAURI_ENV_"],
	define: {
		TAURI: JSON.stringify(!!process.env.TAURI_ENV_PLATFORM),
	},
});
