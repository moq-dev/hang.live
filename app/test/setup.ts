import * as Babel from "@babel/core";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as Bun from "bun";

GlobalRegistrator.register();

// Match Vite's Solid JSX transform while running component tests in Bun.
await Bun.plugin({
	name: "solid-test",
	setup(build) {
		build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
			const result = Babel.transformSync(await Bun.file(path).text(), {
				filename: path,
				presets: [import.meta.resolve("babel-preset-solid"), import.meta.resolve("@babel/preset-typescript")],
			});
			if (!result?.code) throw new Error(`Failed to transform ${path}`);
			return { contents: result.code, loader: "js" };
		});
	},
});
