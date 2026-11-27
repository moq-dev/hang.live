import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";

import { worklet } from "../moq/js/common/vite-plugin-worklet.ts";

// https://vite.dev/config/
export default defineConfig(() => {
	return {
		build: {
			target: "esnext",
			sourcemap: process.env.NODE_ENV === "production" ? false : ("inline" as const),
			rolldownOptions: {
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
