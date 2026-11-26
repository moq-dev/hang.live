import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";

import { worklet } from "../moq/js/common/vite-plugin-worklet.ts";

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		build: {
			target: "esnext",
			sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
			rollupOptions: {
				input: "index.html",
			},
		},
		optimizeDeps: {
			exclude: ["@moq/libav"],
		},

		worker: {
			format: "es" as const,
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
				],
			},
		},
	};
});
