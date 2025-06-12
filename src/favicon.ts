const LINE_SPACING = 64;
const LINE_WIDTH = 10;
const SEGMENTS = 16;
const WOBBLE_AMPLITUDE = 10;
const BEND_AMPLITUDE = 16;
const BEND_PROBABILITY = 0.2;
const WOBBLE_SPEED = 0.0006;
const LINE_OVERDRAW = 2;

function lineColor(now: DOMHighResTimeStamp, i: number) {
	const hue = (i * 50 + now * 0.03) % 360;
	return `hsl(${hue}, 75%, 50%)`;
}

// A node function to output the above as a <svg>
function generateSvg() {
	const now = 0;
	const WIDTH = 256;
	const HEIGHT = 256;

	const LINE_COUNT = Math.ceil(HEIGHT / LINE_SPACING) + LINE_OVERDRAW * 2;

	const paths = [];
	for (let i = 0; i < LINE_COUNT; i++) {
		const color = lineColor(now, i);
		const baseY = (i - LINE_OVERDRAW) * LINE_SPACING;
		const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

		const commands = [];

		for (let s = 0; s <= SEGMENTS; s++) {
			const t = s / SEGMENTS;
			const xBase = -100 + t * (WIDTH + 200);
			const xWobble = Math.sin(now * WOBBLE_SPEED + s + i) * WOBBLE_AMPLITUDE;
			const x = xBase + xWobble;

			const seed = (s * 31 + i * 17) % 100;
			const bend = seed / 100 < BEND_PROBABILITY ? (seed % 2 === 0 ? 1 : -1) * BEND_AMPLITUDE : 0;

			const y = baseY + wobble + bend + t * 200;
			const cmd = `${s === 0 ? "M" : "L"} ${x.toFixed(1)}, ${y.toFixed(1)}`;
			commands.push(cmd);
		}

		const d = commands.join(" ");

		paths.push(`<path stroke="${color}" d="${d}" />`);
	}

	return `<!-- Generated via pnpm tsx src/favicon.ts -->
	<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<clipPath id="rounded-corner">
				<rect x="0" y="0" width="100%" height="100%" rx="32" ry="32" />
			</clipPath>
		</defs>

		<g clip-path="url(#rounded-corner)">
			<rect width="100%" height="100%" fill="black" />
			<g stroke-linecap="round" stroke-width="${LINE_WIDTH}" fill="none">
				${paths.join("\n")}
			</g>
		</g>
	</svg>`;
}

// @ts-expect-error no node types yet
import fs from "node:fs";

// @ts-expect-error no node types yet
if (import.meta.url === `file://${process.argv[1]}`) {
	fs.writeFileSync("public/image/favicon.svg", generateSvg());
	console.log("SVG written to public/image/favicon.svg");
}
