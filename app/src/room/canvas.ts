import { Effect, Signal } from "@kixelated/signals";
import { Vector } from "./geometry";

const LINE_SPACING = 64;
const LINE_WIDTH = 10;
const SEGMENTS = 16;
const WOBBLE_AMPLITUDE = 10;
const BEND_AMPLITUDE = 16;
const BEND_PROBABILITY = 0.2;
const WOBBLE_SPEED = 0.0006;
const LINE_OVERDRAW = 2;

export type CanvasProps = {
	demo?: boolean;
};

export class Canvas {
	#canvas: HTMLCanvasElement;
	#context: CanvasRenderingContext2D;

	// Use a callback to render after the background.
	onRender?: (ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) => void;
	#animate?: number;

	visible: Signal<boolean>;
	viewport: Signal<Vector>;
	demo: Signal<boolean>;

	#signals = new Effect();

	get element() {
		return this.#canvas;
	}

	constructor(element: HTMLCanvasElement, props?: CanvasProps) {
		this.#canvas = element;

		this.demo = new Signal(props?.demo ?? false);

		const context = this.#canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to get canvas context");
		}

		this.#context = context;
		this.visible = new Signal(false);
		this.viewport = new Signal(Vector.create(0, 0));

		const resize = () => {
			// Check if we're in fullscreen or fixed position
			const isFullscreen = document.fullscreenElement === this.#canvas;
			const style = window.getComputedStyle(this.#canvas);
			const isFixed = style.position === "fixed";

			if (isFullscreen || isFixed) {
				// Use window dimensions for fullscreen or fixed position
				this.#canvas.width = window.devicePixelRatio * window.innerWidth;
				this.#canvas.height = window.devicePixelRatio * window.innerHeight;
			} else {
				// Use parent container dimensions
				const parent = this.#canvas.parentElement;
				if (!parent) return;

				const rect = parent.getBoundingClientRect();
				this.#canvas.width = window.devicePixelRatio * rect.width;
				this.#canvas.height = window.devicePixelRatio * rect.height;
			}

			// NOTE: devicePixelRatio is transparently handled by the browser.
			this.viewport.set(Vector.create(this.#canvas.width, this.#canvas.height));
		};

		const visible = () => {
			this.visible.set(document.visibilityState !== "hidden");
		};

		resize();
		visible();

		// Listen for window resize events (for fullscreen/fixed position)
		this.#signals.eventListener(window, "resize", resize);

		// Set up ResizeObserver for parent when canvas is added to DOM
		let resizeObserver: ResizeObserver | null = null;

		const setupParentObserver = () => {
			const parent = this.#canvas.parentElement;
			if (parent && !resizeObserver) {
				resizeObserver = new ResizeObserver(resize);
				resizeObserver.observe(parent);
			}
		};

		// Try to set up observer immediately if already in DOM
		setupParentObserver();

		// Watch for canvas being added to DOM
		const mutationObserver = new MutationObserver(() => {
			if (this.#canvas.parentElement) {
				setupParentObserver();
				mutationObserver.disconnect();
			}
		});

		if (!this.#canvas.parentElement) {
			mutationObserver.observe(document.body, { childList: true, subtree: true });
		}

		this.#signals.eventListener(document, "visibilitychange", visible);

		this.#signals.cleanup(() => {
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			mutationObserver.disconnect();
		});

		// Only render the canvas when it's visible.
		this.#signals.effect((effect) => {
			const visible = effect.get(this.visible);
			if (!visible) return;

			this.#animate = requestAnimationFrame(this.#render.bind(this));
			effect.cleanup(() => cancelAnimationFrame(this.#animate ?? 0));
		});
	}

	#render(now: DOMHighResTimeStamp) {
		const ctx = this.#context;
		ctx.imageSmoothingEnabled = true;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		this.#renderBackground(this.#context, now);

		if (this.demo.peek()) {
			this.#renderDemo(this.#context);
		}

		if (this.onRender) {
			this.onRender(this.#context, now);
		}
		this.#animate = requestAnimationFrame(this.#render.bind(this));
	}

	#renderDemo(ctx: CanvasRenderingContext2D) {
		ctx.save();

		const width = ctx.canvas.width;
		const height = ctx.canvas.height;

		ctx.font = "bold 120px sans-serif";
		ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		const positions = [
			{ x: width * 0.3, y: height * 0.3, angle: -25 },
			{ x: width * 0.7, y: height * 0.5, angle: 30 },
			{ x: width * 0.5, y: height * 0.7, angle: -15 },
			{ x: width * 0.2, y: height * 0.6, angle: 20 },
			{ x: width * 0.8, y: height * 0.25, angle: -35 },
		];

		for (const pos of positions) {
			ctx.save();
			ctx.translate(pos.x, pos.y);
			ctx.rotate((pos.angle * Math.PI) / 180);
			ctx.fillText("DEMO", 0, 0);
			ctx.restore();
		}

		ctx.restore();
	}

	#renderBackground(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
		ctx.save();

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

	toggleFullscreen() {
		if (document.fullscreenElement === this.#canvas) {
			document.exitFullscreen();
		} else {
			this.#canvas.requestFullscreen();
		}
	}

	relative(x: number, y: number): Vector {
		const rect = this.#canvas.getBoundingClientRect();
		const viewport = this.viewport.peek();

		// Convert from page coordinates to canvas coordinates
		// Account for both position offset and scaling
		const pageX = x - rect.left;
		const pageY = y - rect.top;

		// Scale from displayed size to internal canvas size
		const canvasX = (pageX / rect.width) * viewport.x;
		const canvasY = (pageY / rect.height) * viewport.y;

		return Vector.create(canvasX, canvasY);
	}

	close() {
		this.#signals.close();
	}
}

function lineColor(now: DOMHighResTimeStamp, i: number) {
	const hue = (i * 25 + now * 0.1) % 360;
	return `hsl(${hue}, 75%, 50%)`;
}

// A node function to output the above as a <svg>
export function generateSvg() {
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

/* UNCOMMENT TO GENERATE SVG
import fs from "node:fs";

if (import.meta.url === `file://${process.argv[1]}`) {
	fs.writeFileSync("public/image/background.svg", generateSvg());
	console.log("SVG written to public/image/background.svg");
}
*/
