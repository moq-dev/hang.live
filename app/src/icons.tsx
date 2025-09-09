import { createSignal, onMount } from "solid-js";
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
	return `hsl(${hue}, 70%, 50%)`;
}

function drawIcon(ctx: CanvasRenderingContext2D, variant: "macos" | "default") {
	const canvas = ctx.canvas;
	canvas.width = WIDTH;
	canvas.height = HEIGHT;

	const DPI_SCALE = 2;
	canvas.width = WIDTH * DPI_SCALE;
	canvas.height = HEIGHT * DPI_SCALE;
	ctx.scale(DPI_SCALE, DPI_SCALE);

	const now = 0;

	// Dock images are actually smaller than the canvas, so shrink the content down.
	if (variant === "macos") {
		const scale = 0.85;
		const scaledSize = WIDTH * scale;
		const offset = (WIDTH - scaledSize) / 2;
		ctx.translate(offset, offset);
		ctx.scale(scale, scale);
	}

	const LINE_COUNT = Math.ceil(HEIGHT / LINE_SPACING);
	const ROUNDED = 128;

	// Create rounded clipping path
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(0, 0, WIDTH, HEIGHT, ROUNDED);
	ctx.clip();

	// Draw gradient background
	const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
	gradient.addColorStop(0, "#1a1a1a");
	gradient.addColorStop(1, "#000000");
	ctx.fillStyle = gradient;
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

	// Draw h from img/hang/h.svg
	const hang = new Image();
	hang.src = "/image/hang/h.svg";
	ctx.drawImage(hang, 0, 0, WIDTH, HEIGHT);

	// Draw border within the clipped area
	ctx.strokeStyle = "black";
	ctx.lineWidth = BORDER;
	ctx.beginPath();
	const borderRadius = ROUNDED - BORDER / 2;
	ctx.roundRect(BORDER / 2, BORDER / 2, WIDTH - BORDER, HEIGHT - BORDER, borderRadius);
	ctx.stroke();

	ctx.restore();
}

function IconCanvas(props: { variant: "macos" | "default" }) {
	const [iconDataUrl, setIconDataUrl] = createSignal<string>("");
	const sizes = [16, 32, 48, 64, 96, 128, 256];

	const renderIconToPng = (): string => {
		// Create invisible canvas
		const invisibleCanvas = document.createElement("canvas");
		const ctx = invisibleCanvas.getContext("2d");
		if (!ctx) return "";

		// Render icon to invisible canvas
		drawIcon(ctx, props.variant);

		// Convert to PNG data URL
		return invisibleCanvas.toDataURL("image/png");
	};

	const update = () => {
		const dataUrl = renderIconToPng();
		setIconDataUrl(dataUrl);
	};

	onMount(() => {
		update();
		setInterval(update, 1000 / 60);
	});

	const downloadPNG = () => {
		const link = document.createElement("a");
		link.download = `icon-${props.variant}.png`;
		link.href = iconDataUrl();
		link.click();
	};

	return (
		<div class="flex flex-col items-center gap-4">
			<h3 class="text-lg font-bold">{props.variant}</h3>
			<div class="flex flex-wrap gap-4 items-end">
				{sizes.map((size) => (
					<div class="flex flex-col items-center gap-2">
						<div
							style={{
								background: "repeating-conic-gradient(#808080 0 25%, #0000 0 50%) 50% / 20px 20px",
							}}
						>
							{/** biome-ignore lint/a11y/useAltText: no */}
							<img
								src={iconDataUrl()}
								class="border border-zinc-700"
								style={{
									width: `${size}px`,
									height: `${size}px`,
								}}
							/>
						</div>
						<span class="text-sm text-gray-600">{size}px</span>
					</div>
				))}
			</div>
			<button
				onClick={downloadPNG}
				type="button"
				class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
			>
				Download PNG
			</button>
		</div>
	);
}

export function Icons(): JSX.Element {
	return (
		<Layout>
			<div class="flex flex-col gap-8">
				<IconCanvas variant="default" />
				<IconCanvas variant="macos" />
			</div>
		</Layout>
	);
}
