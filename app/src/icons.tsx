import * as DOM from "@kixelated/signals/dom";
import { onMount } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import Layout from "./layout/web";

const LINE_SPACING = 100;
const LINE_WIDTH = 24;
const SEGMENTS = 16;
const WOBBLE_AMPLITUDE = 20;
const BEND_AMPLITUDE = 32;
const BEND_PROBABILITY = 0.2;
const WOBBLE_SPEED = 0.0006;
const LINE_OVERDRAW = 1;
const WIDTH = 512;
const HEIGHT = 512;
const SHADOW_X = -14;
const SHADOW_Y = 10;
const SHADOW_OPACITY = 0.3;
const BORDER = 40;

function lineColor(now: DOMHighResTimeStamp, i: number) {
	const hue = (i * 360 + now * 0.03) % 360;
	return `hsl(${hue}, 75%, 50%)`;
}

function drawIcon(canvas: HTMLCanvasElement, variant?: "discord" | "apple") {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const DPI_SCALE = 2;
	canvas.width = WIDTH * DPI_SCALE;
	canvas.height = HEIGHT * DPI_SCALE;

	ctx.scale(DPI_SCALE, DPI_SCALE);

	const now = 0;
	const LINE_COUNT = Math.ceil(HEIGHT / LINE_SPACING);
	const ROUNDED = variant === "discord" ? 128 : 96;

	// Create rounded clipping path
	if (variant !== "apple") {
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(0, 0, WIDTH, HEIGHT, ROUNDED);
		ctx.clip();
	}

	// Clear entire canvas first
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	// Draw shadow lines
	ctx.globalAlpha = SHADOW_OPACITY;
	ctx.lineWidth = LINE_WIDTH;
	ctx.lineCap = "round";

	for (let i = -LINE_OVERDRAW; i < LINE_COUNT + LINE_OVERDRAW; i++) {
		const color = lineColor(now, i / LINE_COUNT);
		const baseY = (i + 0.15) * LINE_SPACING;
		const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

		ctx.strokeStyle = color;
		ctx.beginPath();

		for (let s = 0; s <= SEGMENTS; s++) {
			const t = s / SEGMENTS;
			const xBase = -100 + t * (WIDTH + 200);
			const xWobble = Math.sin(now * WOBBLE_SPEED + s + i) * WOBBLE_AMPLITUDE;
			const x = xBase + xWobble;

			const seed = (s * 31 + i * 17) % 100;
			const bend = seed / 100 < BEND_PROBABILITY ? (seed % 2 === 0 ? 1 : -1) * BEND_AMPLITUDE : 0;

			const y = baseY + wobble + bend + t * 200;
			const shadowX = x + SHADOW_X;
			const shadowY = y + SHADOW_Y;

			if (s === 0) {
				ctx.moveTo(shadowX, shadowY);
			} else {
				ctx.lineTo(shadowX, shadowY);
			}
		}
		ctx.stroke();
	}

	// Draw main lines
	ctx.globalAlpha = 1.0;

	for (let i = -LINE_OVERDRAW; i < LINE_COUNT + LINE_OVERDRAW; i++) {
		const color = lineColor(now, i / LINE_COUNT);
		const baseY = (i + 0.15) * LINE_SPACING;
		const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

		ctx.strokeStyle = color;
		ctx.beginPath();

		for (let s = 0; s <= SEGMENTS; s++) {
			const t = s / SEGMENTS;
			const xBase = -100 + t * (WIDTH + 200);
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

	// Draw text
	ctx.globalAlpha = 1;
	const textX = (3 * WIDTH) / 4 - ROUNDED / 4;
	const textY = HEIGHT - 128 - ROUNDED / 4;
	const text = "h";
	const fontSize = 192;

	ctx.font = `bold ${fontSize}px Monserrat, Helvetica, Arial, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Text stroke
	ctx.strokeStyle = "black";
	ctx.lineWidth = 60;
	ctx.strokeText(text, textX, textY);

	// Text fill
	ctx.fillStyle = "white";
	ctx.fillText(text, textX, textY);

	// Draw border within the clipped area
	if (variant !== "apple") {
		ctx.strokeStyle = "black";
		ctx.lineWidth = BORDER;
		ctx.beginPath();
		const borderRadius = ROUNDED - BORDER / 2;
		ctx.roundRect(BORDER / 2, BORDER / 2, WIDTH - BORDER, HEIGHT - BORDER, borderRadius);
		ctx.stroke();
	}

	ctx.restore();
}

function IconCanvas(props: { variant?: "discord" | "apple"; name: string }) {
	const masterCanvas = DOM.create("canvas");
	const sizes = [512, 256, 128, 64];

	onMount(() => {
		drawIcon(masterCanvas, props.variant);
	});

	const downloadPNG = () => {
		const link = document.createElement("a");
		link.download = `icon-${props.name}.png`;
		link.href = masterCanvas.toDataURL("image/png");
		link.click();
	};

	return (
		<div class="flex flex-col items-center gap-4">
			<h3 class="text-lg font-bold">{props.name}</h3>
			<div class="flex flex-wrap gap-4 items-end">
				{sizes.map((size) => {
					const previewCanvas = DOM.create("canvas");

					onMount(() => {
						// Copy the master canvas content to preview canvas at different size
						const ctx = previewCanvas.getContext("2d");
						if (ctx) {
							previewCanvas.width = size * 2; // 2x DPI
							previewCanvas.height = size * 2;
							previewCanvas.style.width = `${size}px`;
							previewCanvas.style.height = `${size}px`;
							ctx.drawImage(masterCanvas, 0, 0, size * 2, size * 2);
						}
					});

					return (
						<div class="flex flex-col items-center gap-2">
							<div
								style={{
									background: "repeating-conic-gradient(#808080 0 25%, #0000 0 50%) 50% / 20px 20px",
								}}
							>
								{previewCanvas}
							</div>
							<span class="text-sm text-gray-600">{size}px</span>
						</div>
					);
				})}
			</div>
			<button
				onClick={downloadPNG}
				type="button"
				class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
			>
				Download PNG (1024×1024)
			</button>
		</div>
	);
}

export function Icons(): JSX.Element {
	return (
		<Layout>
			<div class="flex flex-col gap-4">
				<IconCanvas name="default" />
				<IconCanvas variant="discord" name="discord" />
				<IconCanvas variant="apple" name="apple" />
			</div>
		</Layout>
	);
}
