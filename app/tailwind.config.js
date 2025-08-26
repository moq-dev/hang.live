import { addIconsPlugin } from "@iconify/tailwind4";

// tailwind.config.js
export default {
	content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
	plugins: [
		addIconsPlugin({
			collections: {
				"material-symbols": () => import("@iconify-json/material-symbols/icons.json").then((m) => m.default),
				"mdi": () => import("@iconify-json/mdi/icons.json").then((m) => m.default),
			},
			scale: 1,
			prefix: "icon",
		}),
	],
};
