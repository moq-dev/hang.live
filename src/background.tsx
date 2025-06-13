import { JSX } from "solid-js/jsx-runtime";
import Settings from "./settings";
import { onCleanup } from "solid-js";

const LINE_SPACING = 64;
const LINE_WIDTH = 10;
const SEGMENTS = 16;
const WOBBLE_AMPLITUDE = 10;
const BEND_AMPLITUDE = 16;
const BEND_PROBABILITY = 0.2;
const WOBBLE_SPEED = 0.0006;
const LINE_OVERDRAW = 2;

const potato = new Image();

export function renderBackground(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
	ctx.save();

	if (Settings.potato.peek()) {
		// Load the pre-rendered SVG instead of rendering it live.
		potato.src = "/image/background.svg";
		ctx.drawImage(potato, 0, 0, ctx.canvas.width, ctx.canvas.height);
		return;
	}

	const width = ctx.canvas.width;
	const height = ctx.canvas.height;

	const LINE_COUNT = Math.ceil(height / LINE_SPACING) + LINE_OVERDRAW * 2;

	ctx.lineWidth = LINE_WIDTH;
	ctx.lineCap = "round";
	ctx.globalAlpha = 0.25;

	for (let i = 0; i < LINE_COUNT; i++) {
		ctx.strokeStyle = lineColor(now, i);

		const baseY = (i - LINE_OVERDRAW) * LINE_SPACING;
		const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

		ctx.beginPath();

		for (let s = 0; s <= SEGMENTS; s++) {
			const t = s / SEGMENTS;
			const xBase = -100 + t * (width + 200);
			const xWobble = Math.sin(now * WOBBLE_SPEED + s + i) * WOBBLE_AMPLITUDE;
			const x = xBase + xWobble;

			const seed = (s * 31 + i * 17) % 100;
			const bend = seed / 100 < BEND_PROBABILITY ? (seed % 2 === 0 ? 1 : -1) * BEND_AMPLITUDE : 0;

			const y = baseY + wobble + bend + t * 200;
			if (s === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();
	}

	ctx.restore();
}

function lineColor(now: DOMHighResTimeStamp, i: number) {
	const hue = (i * 25 + now * 0.03) % 360;
	return `hsl(${hue}, 75%, 50%)`;
}

// A node function to output the above as a <svg>
// @ts-ignore Not unused, just commented out below.
function generateSvg() {
	const now = 0;
	const WIDTH = 1920;
	const HEIGHT = 1080;

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

	return `<!-- Generated via pnpm tsx src/background.ts -->
	<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
		<rect width="100%" height="100%" fill="black" />
		<g stroke-linecap="round" stroke-width="${LINE_WIDTH}" fill="none" stroke-opacity="0.25">
			${paths.join("\n")}
		</g>
	</svg>`;
}

// Create a background canvas, for non-room pages.
export function Background(): JSX.Element {
	const canvas = (
		<canvas
			style={{
				display: "block",
				"background-color": "#000",
				width: "100%",
				height: "100%",
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				"z-index": -1,
			}}
		/>
	) as HTMLCanvasElement;

	const resize = () => {
		canvas.width = window.devicePixelRatio * window.innerWidth;
		canvas.height = window.devicePixelRatio * window.innerHeight;
	};

	resize();
	window.addEventListener("resize", resize);

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get canvas context");
	}

	let cancel: number;

	const render = (now: DOMHighResTimeStamp) => {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		renderBackground(ctx, now);
		cancel = requestAnimationFrame(render);
	};

	cancel = requestAnimationFrame(render);

	onCleanup(() => {
		cancelAnimationFrame(cancel);
	});

	return canvas;
}

/* UNCOMMENT TO GENERATE SVG
import fs from "node:fs";

if (import.meta.url === `file://${process.argv[1]}`) {
	fs.writeFileSync("public/image/background.svg", generateSvg());
	console.log("SVG written to public/image/background.svg");
}
*/
