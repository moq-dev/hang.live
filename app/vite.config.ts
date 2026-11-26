import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";

import { worklet } from "../moq/js/common/vite-plugin-worklet.ts";

// https://vitejs.dev/config/
export default defineConfig(() => {
	// Avoid bundling 23MB of WASM for optional AI features.
	// TODO fix this for MoQ, why isn't it defaulting to using a CDN?
	const external = ["onnxruntime-web"];

	return {
		build: {
			target: "esnext",
			sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
			rollupOptions: {
				input: "index.html",
				external,
			},
		},
		optimizeDeps: {
			exclude: ["@moq/libav"],
		},

		worker: {
			format: "es" as const,
			rollupOptions: {
				external,
			},
			dedup: ["@huggingface/transformers"],
		},

		plugins: [
			worklet(),
			glsl({
				minify: process.env.NODE_ENV === "production",
			}),
			solid(),
			tailwindcss(),
		],

		resolve: {
			dedupe: ["solid-js"],
		},

		server: {
			port: 1420,
			open: true,
			strictPort: true,
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
	};
});
