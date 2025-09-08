import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// https://vitejs.dev/config/
export default defineConfig(() => ({
	build: {
		target: "esnext",
		sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
		rollupOptions: {
			input: "index.html",
			// Optional: In web builds, mark Tauri packages as external so we won't accidentally bundle them
			external: process.env.TAURI_ENV_PLATFORM ? [] : [/^@tauri-apps\//],
		},
	},
	optimizeDeps: {
		exclude: ["@libav.js/variant-opus-af"],
	},

	worker: {
		format: "es" as const,
	},

	plugins: [solid(), tailwindcss()],

	resolve: {
		dedupe: ["solid-js"],
	},

	// prevent vite from obscuring rust errors
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: process.env.TAURI_DEV_HOST || false,
		hmr: false,
		fs: {
			allow: [
				".",
				// Allow access to parent node_modules for workspace dependencies
				path.resolve("../node_modules"),
			],
		},
	},
	// Env variables starting with the item of `envPrefix` will be exposed in tauri's source code through `import.meta.env`.
	envPrefix: ["VITE_", "TAURI_ENV_*"],

	define: {
		// Detect whether we're in a Tauri environment at build time.
		// This gives vite enough information to tree-shake non-relevant code.
		__TAURI__: JSON.stringify(!!process.env.TAURI_ENV_PLATFORM),
	},
}));
