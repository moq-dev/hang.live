import JSZip from "jszip";
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

type IconVariant =
	| "macos"
	| "default"
	| "ios"
	| "android-launcher"
	| "android-foreground"
	| "android-round"
	| "android-background"
	| "windows-store"
	| "discord-banner";

const PLATFORM_SIZES = {
	desktop: [16, 24, 32, 48, 64, 256, 512], // Windows ICO
	macOS: [16, 32, 64, 128, 256, 512, 1024], // macOS ICNS
	iOS: [
		20,
		29,
		40,
		58,
		60,
		76,
		80,
		87,
		114,
		120,
		152,
		167,
		180,
		1024, // iOS app icons
	],
	android: {
		"mipmap-mdpi": 48,
		"mipmap-hdpi": 72,
		"mipmap-xhdpi": 96,
		"mipmap-xxhdpi": 144,
		"mipmap-xxxhdpi": 192,
	},
	androidAdaptive: {
		"mipmap-mdpi": 108,
		"mipmap-hdpi": 162,
		"mipmap-xhdpi": 216,
		"mipmap-xxhdpi": 324,
		"mipmap-xxxhdpi": 432,
	},
	windowsStore: [50, 30, 44, 71, 89, 107, 142, 150, 284, 310], // Windows Store/AppX
};

function lineColor(now: DOMHighResTimeStamp, i: number) {
	const hue = (i * 360 + now * 0.03) % 360;
	return `hsl(${hue}, 75%, 50%)`;
}

function generateSVG(variant: IconVariant): string {
	const now = 0;

	// Discord banner dimensions
	const isDiscordBanner = variant === "discord-banner";
	const canvasWidth = isDiscordBanner ? 1100 : WIDTH;
	const canvasHeight = isDiscordBanner ? 440 : HEIGHT;

	// Dock images are actually smaller than the canvas, so shrink the content down.
	const scale = variant === "macos" ? 0.85 : 1.0;
	const scaledSize = WIDTH * scale;
	const offset = (WIDTH - scaledSize) / 2;

	// iOS and Android background variants should have no border or rounded corners
	const useRoundedCorners = variant !== "ios" && variant !== "android-background" && !isDiscordBanner;
	const useBorder =
		variant !== "ios" && variant !== "android-foreground" && variant !== "android-background" && !isDiscordBanner;

	// Android round should be perfectly circular
	const isAndroidRound = variant === "android-round";

	// Android adaptive icon system
	const isAndroidForeground = variant === "android-foreground";
	const isAndroidBackground = variant === "android-background";

	// Android foreground: only show the H logo (scaled like macOS)
	// Android background: only show animated lines + dark background (no H)
	// Android launcher/round: complete icon (everything)
	// Discord banner: only show animated lines + dark background (no H logo)
	const showBackground = !isAndroidForeground;
	const showLines = !isAndroidForeground;
	const showHLogo = !isAndroidBackground && !isDiscordBanner;

	const LINE_COUNT = Math.ceil(canvasHeight / LINE_SPACING);
	const ROUNDED = useRoundedCorners ? (isAndroidRound ? WIDTH / 2 : 140) : 0;

	const shadows = [];
	const mainPaths = [];

	if (showLines) {
		for (let i = -LINE_OVERDRAW; i < LINE_COUNT + LINE_OVERDRAW; i++) {
			const color = lineColor(now, i / LINE_COUNT);
			const baseY = (i + 0.15) * LINE_SPACING;
			const wobble = Math.sin(now * WOBBLE_SPEED + i) * WOBBLE_AMPLITUDE;

			const shadowCommands = [];
			const mainCommands = [];

			for (let s = 0; s <= SEGMENTS; s++) {
				const t = s / SEGMENTS;
				const xBase = -100 + t * (canvasWidth + 200);
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
	}

	// Embed the h.svg content - scale to fill the entire icon
	// Original h.svg viewBox is "-10.00 15.00 201.00 251.00" (width: 201, height: 251)
	// NOTE: AI generated this, so it's pretty ugly.
	const hOriginalWidth = 201;
	const hOriginalHeight = 251;

	// Scale H logo for android foreground (much smaller)
	const hScale = variant === "android-foreground" || variant === "android-round" ? 0.85 : 1.0;
	const zoom = Math.min(canvasWidth / hOriginalWidth, canvasHeight / hOriginalHeight) * 1.0;
	const hX = (canvasWidth - hOriginalWidth * zoom * hScale) / 2 + 15 * zoom * hScale;
	const hY = (canvasHeight - hOriginalHeight * zoom * hScale) / 2 - 15 * zoom * hScale;
	const hSvgContent = showHLogo
		? `<g transform="translate(${hX}, ${hY}) scale(${zoom * hScale})">
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
		<path fill="#ffffff" stroke="#000000" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" d="
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
	</g>`
		: "";

	const gradientBorderRadius = ROUNDED - BORDER / 2;

	let clipPath = "";
	let backgroundContent = "";
	let linesContent = "";
	let borderContent = "";

	if (useRoundedCorners) {
		clipPath = `clip-path="url(#rounded-corner-${variant})"`;
	}

	if (showBackground) {
		backgroundContent = `<rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#background-gradient-${variant})" />`;
	}

	if (showLines && shadows.length > 0) {
		linesContent = `
			<!-- Shadow lines -->
			<g opacity="${SHADOW_OPACITY}">
				${shadows.join("\n\t\t\t\t")}
			</g>

			<!-- Main lines -->
			<g>
				${mainPaths.join("\n\t\t\t\t")}
			</g>`;
	}

	if (useBorder) {
		borderContent = `<rect x="${BORDER / 2}" y="${BORDER / 2}" width="${canvasWidth - BORDER}" height="${canvasHeight - BORDER}" rx="${gradientBorderRadius}" ry="${gradientBorderRadius}" stroke="black" stroke-width="${BORDER}" fill="none" />`;
	}

	return `<svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
		<defs>
			${
				useRoundedCorners
					? `<clipPath id="rounded-corner-${variant}">
				<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" rx="${ROUNDED}" ry="${ROUNDED}" />
			</clipPath>`
					: ""
			}
			<linearGradient id="background-gradient-${variant}" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:1" />
				<stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
			</linearGradient>
		</defs>

		<g ${clipPath} transform="translate(${offset}, ${offset}) scale(${scale})">
			<!-- Background -->
			${backgroundContent}
			${linesContent}

			<!-- Border -->
			${borderContent}
		</g>

		<!-- H SVG -->
		<g transform="translate(${offset}, ${offset}) scale(${scale})">
			${hSvgContent}
		</g>
	</svg>`;
}

async function svgToPng(svgString: string, size: number, width?: number, height?: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			reject(new Error("Could not get canvas context"));
			return;
		}

		canvas.width = width ?? size;
		canvas.height = height ?? size;

		const img = new Image();
		img.onload = () => {
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			resolve(canvas.toDataURL("image/png"));
		};
		img.onerror = () => reject(new Error("Failed to load SVG"));

		const blob = new Blob([svgString], { type: "image/svg+xml" });
		img.src = URL.createObjectURL(blob);
	});
}

function getVariantSizes(variant: IconVariant): number[] {
	switch (variant) {
		case "default":
			return PLATFORM_SIZES.desktop;
		case "macos":
			return PLATFORM_SIZES.macOS;
		case "ios":
			return PLATFORM_SIZES.iOS;
		case "android-launcher":
		case "android-round":
			return Object.values(PLATFORM_SIZES.android);
		case "android-foreground":
		case "android-background":
			return Object.values(PLATFORM_SIZES.androidAdaptive);
		case "windows-store":
			return PLATFORM_SIZES.windowsStore;
		case "discord-banner":
			return [1100]; // Only one size for Discord banner
		default:
			return [512];
	}
}

function getVariantDisplayName(variant: IconVariant): string {
	switch (variant) {
		case "default":
			return "Windows/Linux Desktop";
		case "macos":
			return "macOS";
		case "ios":
			return "iOS";
		case "android-launcher":
			return "Android Launcher";
		case "android-foreground":
			return "Android Foreground";
		case "android-round":
			return "Android Round";
		case "android-background":
			return "Android Background";
		case "windows-store":
			return "Windows Store/UWP";
		case "discord-banner":
			return "Discord Banner (1100x440)";
		default:
			return variant;
	}
}

async function generateAndroidFolderStructure(
	variant: string,
	svgString: string,
): Promise<{ [filePath: string]: string }> {
	const files: { [filePath: string]: string } = {};

	// Use adaptive sizes for foreground/background, regular sizes for launcher/round
	const sizeMap =
		variant === "android-foreground" || variant === "android-background"
			? PLATFORM_SIZES.androidAdaptive
			: PLATFORM_SIZES.android;

	for (const [folder, size] of Object.entries(sizeMap)) {
		const iconName =
			variant === "android-foreground"
				? "ic_launcher_foreground.png"
				: variant === "android-background"
					? "ic_launcher_background.png"
					: variant === "android-round"
						? "ic_launcher_round.png"
						: "ic_launcher.png";
		const filePath = `${folder}/${iconName}`;
		const pngDataUrl = await svgToPng(svgString, size);
		files[filePath] = pngDataUrl;
	}

	return files;
}

async function generateiOSFiles(svgString: string): Promise<{ [filePath: string]: string }> {
	const files: { [filePath: string]: string } = {};

	// iOS specific naming convention
	const iOSSizes = [
		{ size: 20, scales: [1, 2, 3] },
		{ size: 29, scales: [1, 2, 3] },
		{ size: 40, scales: [1, 2, 3] },
		{ size: 60, scales: [2, 3] },
		{ size: 76, scales: [1, 2] },
		{ size: 83.5, scales: [2] },
		{ size: 1024, scales: [1] },
	];

	for (const { size, scales } of iOSSizes) {
		for (const scale of scales) {
			const actualSize = Math.round(size * scale);
			const filename =
				scale === 1 ? `AppIcon-${size}x${size}@${scale}x.png` : `AppIcon-${size}x${size}@${scale}x.png`;
			const pngDataUrl = await svgToPng(svgString, actualSize);
			files[filename] = pngDataUrl;
		}
	}

	return files;
}

async function generateWindowsStoreFiles(svgString: string): Promise<{ [filePath: string]: string }> {
	const files: { [filePath: string]: string } = {};

	// StoreLogo.png (size 50)
	const storeLogoPngDataUrl = await svgToPng(svgString, 50);
	files["StoreLogo.png"] = storeLogoPngDataUrl;

	// Square*Logo.png files
	const squareSizes = [30, 44, 71, 89, 107, 142, 150, 284, 310];
	for (const size of squareSizes) {
		const filename = `Square${size}x${size}Logo.png`;
		const pngDataUrl = await svgToPng(svgString, size);
		files[filename] = pngDataUrl;
	}

	return files;
}

function IconCanvas(props: { variant: IconVariant }) {
	const [iconDataUrl, setIconDataUrl] = createSignal<string>("");
	const [svgDataUrl, setSvgDataUrl] = createSignal<string>("");
	const [isGenerating, setIsGenerating] = createSignal<boolean>(false);

	const sizes = getVariantSizes(props.variant);

	const renderIconToPng = async (): Promise<string> => {
		const svgString = generateSVG(props.variant);
		try {
			if (props.variant === "discord-banner") {
				return await svgToPng(svgString, 1100, 1100, 440);
			}
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

	onMount(async () => {
		const svgDataUrl = renderIconToSvg();
		setSvgDataUrl(svgDataUrl);

		const pngDataUrl = await renderIconToPng();
		setIconDataUrl(pngDataUrl);
	});

	const downloadPNG = async (size?: number) => {
		const svgString = generateSVG(props.variant);
		let pngDataUrl: string;

		if (size && props.variant === "discord-banner") {
			// For discord banner, use the 1100x440 dimensions
			pngDataUrl = await svgToPng(svgString, size, 1100, 440);
		} else if (size) {
			pngDataUrl = await svgToPng(svgString, size);
		} else {
			pngDataUrl = iconDataUrl();
		}

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

	const downloadAllAsZip = async () => {
		setIsGenerating(true);
		try {
			const zip = new JSZip();
			const svgString = generateSVG(props.variant);

			if (props.variant.startsWith("android")) {
				const files = await generateAndroidFolderStructure(props.variant, svgString);
				for (const [filePath, dataUrl] of Object.entries(files)) {
					const base64 = dataUrl.split(",")[1];
					zip.file(filePath, base64, { base64: true });
				}
			} else if (props.variant === "ios") {
				const files = await generateiOSFiles(svgString);
				for (const [filename, dataUrl] of Object.entries(files)) {
					const base64 = dataUrl.split(",")[1];
					zip.file(filename, base64, { base64: true });
				}
			} else if (props.variant === "windows-store") {
				const files = await generateWindowsStoreFiles(svgString);
				for (const [filename, dataUrl] of Object.entries(files)) {
					const base64 = dataUrl.split(",")[1];
					zip.file(filename, base64, { base64: true });
				}
			} else if (props.variant === "discord-banner") {
				// Discord banner with 1100x440 dimensions
				for (const size of sizes) {
					const pngDataUrl = await svgToPng(svgString, size, 1100, 440);
					const base64 = pngDataUrl.split(",")[1];
					zip.file(`discord-banner-${size}x440.png`, base64, { base64: true });
				}
			} else {
				// Regular platform with just different sizes
				for (const size of sizes) {
					const pngDataUrl = await svgToPng(svgString, size);
					const base64 = pngDataUrl.split(",")[1];
					zip.file(`${size}x${size}.png`, base64, { base64: true });
				}
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });
			const link = document.createElement("a");
			link.download = `icons-${props.variant}.zip`;
			link.href = URL.createObjectURL(zipBlob);
			link.click();
		} catch (error) {
			console.error("Failed to generate ZIP:", error);
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<div class="flex flex-col items-center gap-4">
			<h3 class="text-lg font-bold">{getVariantDisplayName(props.variant)}</h3>

			{/* Preview and bulk download */}
			<div class="flex flex-col items-center gap-2">
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
							width: props.variant === "discord-banner" ? "512px" : "256px",
							height: props.variant === "discord-banner" ? "205px" : "256px",
						}}
					/>
				</div>
				<div class="flex gap-2">
					<button
						onClick={downloadSVG}
						type="button"
						class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						Download SVG
					</button>
					<button
						onClick={downloadAllAsZip}
						type="button"
						disabled={isGenerating()}
						class="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
					>
						{isGenerating() ? "Generating..." : "Download All (ZIP)"}
					</button>
				</div>
			</div>

			{/* Individual PNG Sizes */}
			<div class="flex flex-wrap gap-2 justify-center">
				{sizes.map((size) => (
					<button
						onClick={() => downloadPNG(size)}
						type="button"
						class="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						{size}px
					</button>
				))}
			</div>
		</div>
	);
}

export function Icons(): JSX.Element {
	const variants: IconVariant[] = [
		"default",
		"macos",
		"ios",
		"android-launcher",
		"android-foreground",
		"android-background",
		"android-round",
		"windows-store",
		"discord-banner",
	];

	return (
		<Layout>
			<div class="flex flex-col gap-8">
				{variants.map((variant) => (
					<IconCanvas variant={variant} />
				))}

				{/* Setup Instructions */}
				<div class="max-w-4xl mx-auto mt-12 p-6 bg-gray-900 rounded-lg border border-gray-700">
					<h2 class="text-xl font-bold mb-4 text-white">🚀 Setup Instructions</h2>
					<div class="space-y-4 text-sm">
						<div>
							<h3 class="font-semibold text-gray-200 mb-2">1. Download All ZIP Files</h3>
							<p class="text-gray-400 mb-2">Click "Download All (ZIP)" for each variant above to get:</p>
							<ul class="list-disc list-inside ml-4 space-y-1 text-gray-400">
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons-default.zip</code> -
									Windows/Linux desktop icons
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons-macos.zip</code> - macOS
									app icons
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons-ios.zip</code> - iOS app
									icons
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">
										icons-android-launcher.zip
									</code>{" "}
									- Android launcher icons
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">
										icons-android-foreground.zip
									</code>{" "}
									- Android adaptive foreground
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">
										icons-android-background.zip
									</code>{" "}
									- Android adaptive background
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons-android-round.zip</code>{" "}
									- Android round icons
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons-windows-store.zip</code>{" "}
									- Windows Store/UWP app icons
								</li>
							</ul>
						</div>

						<div>
							<h3 class="font-semibold text-gray-200 mb-2">2. Move to Native Directory</h3>
							<p class="text-gray-400 mb-2">Move all downloaded ZIP files to the native directory:</p>
							<pre class="bg-gray-800 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto">
								mv ~/Downloads/icons-*.zip native/
							</pre>
						</div>

						<div>
							<h3 class="font-semibold text-gray-200 mb-2">3. Generate Icons</h3>
							<p class="text-gray-400 mb-2">Run the icon generation command:</p>
							<pre class="bg-gray-800 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto">
								cd native && just icons
							</pre>
							<p class="text-gray-400 mt-2 text-xs">
								<strong>Note:</strong> Requires ImageMagick and png2icns/iconutil. Install with{" "}
								<code class="bg-gray-800 px-1 rounded text-green-400">
									brew install imagemagick png2icns
								</code>{" "}
								or use <code class="bg-gray-800 px-1 rounded text-green-400">nix develop</code>
							</p>
						</div>

						<div>
							<h3 class="font-semibold text-gray-200 mb-2">4. What Gets Generated</h3>
							<ul class="list-disc list-inside ml-4 space-y-1 text-gray-400">
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons/icon.ico</code> -
									Windows executable icon
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons/icon.icns</code> - macOS
									app bundle icon
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons/android/</code> -
									Android adaptive icons in proper folder structure
								</li>
								<li>
									<code class="bg-gray-800 px-1 rounded text-green-400">icons/ios/</code> - iOS app
									icons with correct naming
								</li>
							</ul>
						</div>

						<div class="bg-blue-900 border border-blue-700 rounded p-3">
							<p class="text-blue-200 text-xs">
								💡 <strong>Tip:</strong> The ZIP files are automatically ignored by git. The generated
								icons will be ready for Tauri to use in your app builds!
							</p>
						</div>
					</div>
				</div>
			</div>
		</Layout>
	);
}
