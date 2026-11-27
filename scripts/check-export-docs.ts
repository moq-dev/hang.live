// Fails on any top-level export in app/src or api/src without a comment on the line directly above it.
// Neither TypeScript nor Biome has a missing-docs rule, and one rule doesn't justify a second linter.
import { Glob } from "bun";

const roots = ["api/src", "app/src"];
const missing: string[] = [];

for (const root of roots) {
	for await (const path of new Glob("**/*.{ts,tsx}").scan(root)) {
		if (path.endsWith(".d.ts") || /\.test\.tsx?$/.test(path)) continue;

		const lines = (await Bun.file(`${root}/${path}`).text()).split("\n");
		lines.forEach((line, index) => {
			if (!line.startsWith("export ")) return;
			const above = lines[index - 1]?.trim() ?? "";
			if (above.startsWith("//") || above.endsWith("*/")) return;
			missing.push(`${root}/${path}:${index + 1}: ${line}`);
		});
	}
}

if (missing.length > 0) {
	console.error(`${missing.length} export(s) need a one-line comment saying what they are:`);
	for (const entry of missing.sort()) console.error(`  ${entry}`);
	process.exit(1);
}
