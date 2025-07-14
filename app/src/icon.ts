const LINE_SPACING = 56;
const LINE_WIDTH = 12;
const SEGMENTS = 16;
const WOBBLE_AMPLITUDE = 10;
const BEND_AMPLITUDE = 16;
const BEND_PROBABILITY = 0.2;
const WOBBLE_SPEED = 0.0006;
const LINE_OVERDRAW = 2;
const WIDTH = 256;
const HEIGHT = 256;
const SHADOW_X = -7;
const SHADOW_Y = 5;
const SHADOW_OPACITY = 0.3;
const BORDER = 40;

function lineColor(now: DOMHighResTimeStamp, i: number) {
	const hue = (i * 50 + now * 0.03) % 360;
	return `hsl(${hue}, 75%, 50%)`;
}

// A node function to output the above as a <svg>
function generateSvg(variant?: "full" | "discord") {
	const now = 0;

	const LINE_COUNT = Math.ceil(HEIGHT / LINE_SPACING) + LINE_OVERDRAW;
	const ROUNDED = variant === "discord" ? 64 : 48;

	const paths = [];
	const shadows = [];

	for (let i = 0; i < LINE_COUNT; i++) {
		const color = lineColor(now, i);
		const baseY = (i - LINE_OVERDRAW) * LINE_SPACING;
		const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

		const commands = [];
		const shadowCommands = [];

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

			const shadowCmd = `${s === 0 ? "M" : "L"} ${(x + SHADOW_X).toFixed(1)}, ${(y + SHADOW_Y).toFixed(1)}`;
			shadowCommands.push(shadowCmd);
		}

		const d = commands.join(" ");
		const shadowD = shadowCommands.join(" ");

		paths.push(`<path stroke="${color}" d="${d}" />`);
		shadows.push(`<path stroke="${color}" d="${shadowD}" />`);
	}

	const textX = variant !== "full" ? (3 * WIDTH) / 4 - ROUNDED / 4 : WIDTH / 2;
	const textY = HEIGHT - 64 - ROUNDED / 4;
	const text = variant !== "full" ? "h" : "hang";
	const fontSize = variant !== "full" ? 96 : 72;

	return `<!-- Generated via pnpm tsx src/icon.ts -->
	<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<clipPath id="rounded-corner">
				<rect x="0" y="0" width="100%" height="100%" rx="${ROUNDED}" ry="${ROUNDED}" />
			</clipPath>
		</defs>

		<g clip-path="url(#rounded-corner)">
			<rect width="100%" height="100%" fill="black" />

			<g stroke-linecap="round" stroke-width="${LINE_WIDTH}" fill="none" opacity="${SHADOW_OPACITY}">
				${shadows.join("\n")}
			</g>
			<g stroke-linecap="round" stroke-width="${LINE_WIDTH}" fill="none" opacity="0.8">
				${paths.join("\n")}
			</g>
			<text x="${textX}" y="${textY}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="Monserrat, Helvetica, Arial, sans-serif" fill="white" stroke="black" stroke-width="30" paint-order="stroke">${text}</text>

			<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${ROUNDED}" ry="${ROUNDED}" stroke="black" stroke-width="${BORDER}" fill="none" />
		</g>
	</svg>`;
}

// @ts-expect-error no node types yet
import fs from "node:fs";

// @ts-expect-error no node types yet
if (import.meta.url === `file://${process.argv[1]}`) {
	const small = generateSvg();
	fs.writeFileSync("public/image/icon.svg", small);
	console.log("SVG written to public/image/icon.svg");

	const large = generateSvg("full");
	fs.writeFileSync("public/image/icon-full.svg", large);
	console.log("SVG written to public/image/icon-full.svg");

	const discord = generateSvg("discord");
	fs.writeFileSync("public/image/icon-discord.svg", discord);
	console.log("SVG written to public/image/icon-discord.svg");
}
