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

function generateSVG(variant: "macos" | "default"): string {
	const now = 0;

	// Dock images are actually smaller than the canvas, so shrink the content down.
	const scale = variant === "macos" ? 0.85 : 1;
	const scaledSize = WIDTH * scale;
	const offset = variant === "macos" ? (WIDTH - scaledSize) / 2 : 0;

	const LINE_COUNT = Math.ceil(HEIGHT / LINE_SPACING);
	const ROUNDED = 128;

	const shadows = [];
	const mainPaths = [];

	for (let i = -LINE_OVERDRAW; i < LINE_COUNT + LINE_OVERDRAW; i++) {
		const color = lineColor(now, i / LINE_COUNT);
		const baseY = (i + 0.15) * LINE_SPACING;
		const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

		const shadowCommands = [];
		const mainCommands = [];

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

			const cmd = `${s === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
			const shadowCmd = `${s === 0 ? "M" : "L"} ${shadowX.toFixed(1)},${shadowY.toFixed(1)}`;

			mainCommands.push(cmd);
			shadowCommands.push(shadowCmd);
		}

		const mainD = mainCommands.join(" ");
		const shadowD = shadowCommands.join(" ");

		shadows.push(
			`<path stroke="${color}" stroke-width="${LINE_WIDTH}" stroke-linecap="round" fill="none" d="${shadowD}" />`,
		);
		mainPaths.push(
			`<path stroke="${color}" stroke-width="${LINE_WIDTH}" stroke-linecap="round" fill="none" d="${mainD}" />`,
		);
	}

	// Embed the h.svg content - scale to fill the entire icon
	// Original h.svg viewBox is "-10.00 15.00 201.00 251.00" (width: 201, height: 251)
	// NOTE: AI generated this, so it's pretty ugly.
	const hOriginalWidth = 201;
	const hOriginalHeight = 251;
	const zoom = Math.min(WIDTH / hOriginalWidth, HEIGHT / hOriginalHeight) * 1.3;
	const hX = (WIDTH - hOriginalWidth * zoom) / 2 + 15 * zoom;
	const hY = (HEIGHT - hOriginalHeight * zoom) / 2 - 15 * zoom;
	const hSvgContent = `<g transform="translate(${hX}, ${hY}) scale(${zoom})">
		<path fill="none" stroke="#000000" stroke-width="20" stroke-linejoin="round" stroke-linecap="round" d="
			M 80.26 255.00
			L 78.09 255.00
			Q 67.59 253.67 63.69 245.02
			Q 60.84 238.69 58.24 226.73
			Q 56.68 219.59 54.82 214.11
			C 44.25 183.00 31.00 148.51 19.09 115.33
			C 10.44 91.25 4.25 67.56 0.91 43.61
			C 0.21 38.54 1.39 30.91 6.14 27.85
			C 14.84 22.24 21.83 33.83 24.38 40.69
			C 38.08 77.54 49.13 107.68 63.51 139.43
			A 0.27 0.27 0.0 0 0 64.01 139.41
			C 69.51 124.08 77.71 107.01 93.58 101.95
			Q 99.53 100.05 106.04 101.26
			C 126.42 105.05 140.18 125.38 149.68 142.14
			Q 153.94 149.64 159.28 161.64
			C 165.97 176.65 173.03 192.17 179.07 207.96
			Q 181.49 214.31 178.98 220.97
			C 173.59 235.30 160.80 236.18 150.76 225.63
			Q 148.79 223.56 146.18 216.85
			Q 141.37 204.48 132.02 183.72
			Q 124.87 167.82 116.89 149.34
			C 113.61 141.73 109.42 133.22 103.42 127.70
			A 0.77 0.77 0.0 0 0 102.19 127.97
			Q 95.17 145.38 91.42 163.48
			Q 87.12 184.24 89.20 206.63
			C 89.88 213.94 93.16 222.07 95.06 228.47
			Q 96.61 233.64 96.46 236.78
			C 96.02 246.34 90.03 253.67 80.26 255.00
			Z"
		/>
		<path fill="#ffffff" stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" d="
			M 80.26 255.00
			L 78.09 255.00
			Q 67.59 253.67 63.69 245.02
			Q 60.84 238.69 58.24 226.73
			Q 56.68 219.59 54.82 214.11
			C 44.25 183.00 31.00 148.51 19.09 115.33
			C 10.44 91.25 4.25 67.56 0.91 43.61
			C 0.21 38.54 1.39 30.91 6.14 27.85
			C 14.84 22.24 21.83 33.83 24.38 40.69
			C 38.08 77.54 49.13 107.68 63.51 139.43
			A 0.27 0.27 0.0 0 0 64.01 139.41
			C 69.51 124.08 77.71 107.01 93.58 101.95
			Q 99.53 100.05 106.04 101.26
			C 126.42 105.05 140.18 125.38 149.68 142.14
			Q 153.94 149.64 159.28 161.64
			C 165.97 176.65 173.03 192.17 179.07 207.96
			Q 181.49 214.31 178.98 220.97
			C 173.59 235.30 160.80 236.18 150.76 225.63
			Q 148.79 223.56 146.18 216.85
			Q 141.37 204.48 132.02 183.72
			Q 124.87 167.82 116.89 149.34
			C 113.61 141.73 109.42 133.22 103.42 127.70
			A 0.77 0.77 0.0 0 0 102.19 127.97
			Q 95.17 145.38 91.42 163.48
			Q 87.12 184.24 89.20 206.63
			C 89.88 213.94 93.16 222.07 95.06 228.47
			Q 96.61 233.64 96.46 236.78
			C 96.02 246.34 90.03 253.67 80.26 255.00
			Z"
		/>
	</g>`;

	const gradientBorderRadius = ROUNDED - BORDER / 2;

	return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<clipPath id="rounded-corner-${variant}">
				<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${ROUNDED}" ry="${ROUNDED}" />
			</clipPath>
			<linearGradient id="background-gradient-${variant}" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:1" />
				<stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
			</linearGradient>
		</defs>

		<g clip-path="url(#rounded-corner-${variant})" ${variant === "macos" ? `transform="translate(${offset}, ${offset}) scale(${scale})"` : ""}>
			<!-- Background -->
			<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background-gradient-${variant})" />

			<!-- Shadow lines -->
			<g opacity="${SHADOW_OPACITY}">
				${shadows.join("\n\t\t\t\t")}
			</g>

			<!-- Main lines -->
			<g>
				${mainPaths.join("\n\t\t\t\t")}
			</g>

			<!-- H SVG -->
			${hSvgContent}

			<!-- Border -->
			<rect x="${BORDER / 2}" y="${BORDER / 2}" width="${WIDTH - BORDER}" height="${HEIGHT - BORDER}" rx="${gradientBorderRadius}" ry="${gradientBorderRadius}" stroke="black" stroke-width="${BORDER}" fill="none" />
		</g>
	</svg>`;
}

async function svgToPng(svgString: string, size: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			reject(new Error("Could not get canvas context"));
			return;
		}

		canvas.width = size;
		canvas.height = size;

		const img = new Image();
		img.onload = () => {
			ctx.drawImage(img, 0, 0, size, size);
			resolve(canvas.toDataURL("image/png"));
		};
		img.onerror = () => reject(new Error("Failed to load SVG"));

		const blob = new Blob([svgString], { type: "image/svg+xml" });
		img.src = URL.createObjectURL(blob);
	});
}

function IconCanvas(props: { variant: "macos" | "default" }) {
	const [iconDataUrl, setIconDataUrl] = createSignal<string>("");
	const [svgDataUrl, setSvgDataUrl] = createSignal<string>("");
	const sizes = [256, 128, 64, 32, 16];

	const renderIconToPng = async (): Promise<string> => {
		const svgString = generateSVG(props.variant);
		try {
			return await svgToPng(svgString, WIDTH);
		} catch (error) {
			console.error("Failed to convert SVG to PNG:", error);
			return "";
		}
	};

	const renderIconToSvg = (): string => {
		const svgString = generateSVG(props.variant);
		const blob = new Blob([svgString], { type: "image/svg+xml" });
		return URL.createObjectURL(blob);
	};

	const update = async () => {
		const svgDataUrl = renderIconToSvg();
		setSvgDataUrl(svgDataUrl);

		const pngDataUrl = await renderIconToPng();
		setIconDataUrl(pngDataUrl);
	};

	onMount(() => {
		update();
		setInterval(update, 1000 / 60);
	});

	const downloadPNG = async (size?: number) => {
		const svgString = generateSVG(props.variant);
		const pngDataUrl = size ? await svgToPng(svgString, size) : iconDataUrl();

		const link = document.createElement("a");
		link.download = `icon-${props.variant}${size ? `-${size}px` : ""}.png`;
		link.href = pngDataUrl;
		link.click();
	};

	const downloadSVG = () => {
		const link = document.createElement("a");
		link.download = `icon-${props.variant}.svg`;
		link.href = svgDataUrl();
		link.click();
	};

	return (
		<div class="flex flex-col items-center gap-4">
			<h3 class="text-lg font-bold">{props.variant}</h3>

			{/* PNG Sizes */}
			<div class="flex flex-col items-center gap-2">
				<div class="flex flex-wrap gap-4 items-end">
					<div class="flex flex-col items-center gap-2">
						<span class="text-sm text-gray-600">SVG</span>
						<div
							style={{
								background: "repeating-conic-gradient(#808080 0 25%, #0000 0 50%) 50% / 20px 20px",
							}}
						>
							{/** biome-ignore lint/a11y/useAltText: no */}
							<img
								src={svgDataUrl()}
								class="border border-zinc-700"
								style={{
									width: "512px",
									height: "512px",
								}}
							/>
						</div>
						<button
							onClick={downloadSVG}
							type="button"
							class="px-2 py-1 text-md bg-blue-500 text-white rounded hover:bg-blue-600"
						>
							Save
						</button>
					</div>
					{sizes.map((size) => (
						<div class="flex flex-col items-center gap-2">
							<span class="text-sm text-gray-600">{size}px</span>
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
							<button
								onClick={() => downloadPNG(size)}
								type="button"
								class="px-2 py-1 text-md bg-blue-500 text-white rounded hover:bg-blue-600"
							>
								Export
							</button>
						</div>
					))}
				</div>
			</div>

			<div class="flex gap-4"></div>
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
