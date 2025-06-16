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
	},

	plugins: [solid(), Icons({ scale: 1, compiler: "solid" }), tailwindcss()],

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
	},
}));
