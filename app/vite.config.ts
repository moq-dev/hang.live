import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(() => ({
	build: {
		target: "esnext",
		sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
		rollupOptions: {
			input: "index.html",
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
		host: host || "localhost",
		hmr: false,
		watch: {
			// 3. tell vite to ignore watching `tauri`
			ignored: ["**/tauri/**"],
		},
		fs: {
			allow: [
				".",
				// Allow `npm link @kixelated/hang`
				fs.realpathSync(path.resolve("node_modules/@kixelated/hang")),
				// Allow access to parent node_modules for workspace dependencies
				path.resolve("../node_modules"),
			],
		},
	},
}));
