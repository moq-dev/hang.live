import * as fs from "node:fs";
import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig(() => {
	// Optional: Make sure we never bundle Tauri packages just in case tree-shaking doesn't work.
	const external: (string | RegExp)[] = process.env.TAURI_ENV_PLATFORM ? [] : [/^@tauri-apps\//];

	// Avoid bundling 23MB of WASM for optional AI features.
	// TODO fix this for MoQ, why isn't it defaulting to using a CDN?
	external.push("onnxruntime-web");

	return {
		define: {
			TAURI: JSON.stringify(!!process.env.TAURI_ENV_PLATFORM),
		},
		envPrefix: ["VITE_", "TAURI_ENV_"],
		build: {
			target: "esnext",
			sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
			rollupOptions: {
				input: "index.html",
				external,
			},
		},
		optimizeDeps: {
			exclude: ["@libav.js/variant-opus-af"],
		},

		worker: {
			format: "es" as const,
			rollupOptions: {
				external,
			},
			dedup: ["@huggingface/transformers"],
		},

		plugins: [
			glsl({
				minify: process.env.NODE_ENV === "production",
			}),
			solid(),
			tailwindcss(),
			process.env.TAURI_ENV_PLATFORM &&
				viteStaticCopy({
					targets: [
						// We copy the version files otherwise Vite yells at us importing JSON modules.
						{
							src: "src/version/*",
							dest: "version",
						},
					],
				}),
			process.env.TAURI_ENV_PLATFORM && {
				name: "delete-meme",
				async writeBundle() {
					await fs.promises.rm("dist/meme", { recursive: true, force: true });
				},
			},
		].filter(Boolean),

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
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
				"Access-Control-Allow-Headers": "Range",
				"Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length",
				"Accept-Ranges": "bytes",
			},
			fs: {
				allow: [
					".",
					// Allow access to parent node_modules for workspace dependencies
					path.resolve("../node_modules"),
					// Allow fetching MoQ workers and worklets
					path.resolve("../moq"),
					path.resolve("../../../.grok/worktrees/work-moq/2026-09-12-6f47947f"),
				],
			},
		},
	};
});
