import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
	build: {
		target: "esnext",
		rollupOptions: {
			input: {
				main: "index.html",
				demo: "demo.html",
				about: "about.html",
			},
		},
		sourcemap: true,
	},

	optimizeDeps: {
		// Workaround for: https://github.com/vitejs/vite/issues/8427
		exclude: ["@kixelated/hang"],
	},

	plugins: [solid(), Icons({ scale: 1, compiler: "solid" }), tailwindcss()],

	resolve: {
		dedupe: ["solid-js"],
	},

	// prevent vite from obscuring rust errors
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: false,
		watch: {
			// 3. tell vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
		fs: {
			allow: [
				".",
				// Allow `npm link @kixelated/hang`
				fs.realpathSync(path.resolve("node_modules/@kixelated/hang")),
			],
		},
	},
}));
