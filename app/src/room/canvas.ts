import { Effect, Signal } from "@moq/signals";
import Settings from "../settings";
import { Vector } from "./geometry";
import { BackgroundRenderer } from "./gl/background";
import { Camera } from "./gl/camera";
import { GLContext } from "./gl/context";

export class Canvas {
	#canvas: HTMLCanvasElement;
	#glContext?: GLContext;
	#camera?: Camera;
	#backgroundRenderer?: BackgroundRenderer;

	/** Whether this canvas can render with WebGL2. */
	readonly supported: boolean;

	// Use a callback to render after the background.
	onRender?: (now: DOMHighResTimeStamp) => void;

	visible: Signal<boolean>;
	viewport: Signal<Vector>;

	#signals = new Effect();

	get element() {
		return this.#canvas;
	}

	get gl(): WebGL2RenderingContext {
		if (!this.#glContext) throw new Error("WebGL2 not supported");
		return this.#glContext.gl;
	}

	get glContext(): GLContext {
		if (!this.#glContext) throw new Error("WebGL2 not supported");
		return this.#glContext;
	}

	get camera(): Camera {
		if (!this.#camera) throw new Error("WebGL2 not supported");
		return this.#camera;
	}

	constructor(element: HTMLCanvasElement) {
		this.#canvas = element;

		this.visible = new Signal(false);
		this.viewport = new Signal(Vector.create(0, 0));

		const glContext = GLContext.create(this.#canvas, this.viewport);
		this.#glContext = glContext;
		this.supported = glContext !== undefined;
		if (!glContext) return;

		const camera = new Camera();
		this.#camera = camera;
		this.#backgroundRenderer = new BackgroundRenderer(glContext);

		const resize = (entries: ResizeObserverEntry[]) => {
			for (const entry of entries) {
				// Get device pixel dimensions using the user's configured ratio
				const dpr = Settings.render.scale.peek();

				// Always use contentBoxSize and multiply by our custom ratio
				// to ensure we respect the user's setting
				const width = entry.contentBoxSize[0].inlineSize * dpr;
				const height = entry.contentBoxSize[0].blockSize * dpr;

				const newWidth = Math.max(1, Math.floor(width));
				const newHeight = Math.max(1, Math.floor(height));

				// Only update canvas if dimensions actually changed
				if (this.#canvas.width === newWidth && this.#canvas.height === newHeight) {
					return;
				}

				this.#canvas.width = newWidth;
				this.#canvas.height = newHeight;

				// Update WebGL viewport
				glContext.resize(newWidth, newHeight);

				// The internal logic ignores devicePixelRatio because we automatically scale when rendering.
				const viewport = Vector.create(newWidth / dpr, newHeight / dpr);
				this.viewport.set(viewport);

				// Update camera projection
				camera.updateOrtho(viewport);

				// Render immediately to avoid black flicker during resize
				if (this.visible.peek()) {
					this.#render(performance.now());
				}
			}
		};

		const visible = () => {
			this.visible.set(document.visibilityState !== "hidden");
		};

		visible();

		// Set up ResizeObserver for canvas
		// Use content-box so we can apply our custom devicePixelRatio setting
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(this.#canvas, { box: "content-box" });

		this.#signals.event(document, "visibilitychange", visible);

		// Trigger resize when devicePixelRatio setting changes
		this.#signals.subscribe(Settings.render.scale, () => {
			// Force a resize by temporarily disconnecting and reconnecting
			resizeObserver.disconnect();
			resizeObserver.observe(this.#canvas, { box: "content-box" });
		});

		this.#signals.cleanup(() => {
			resizeObserver.disconnect();
		});

		// Only render the canvas when it's visible.
		this.#signals.run((effect) => {
			const visible = effect.get(this.visible);
			if (!visible) return;

			let cancel: number;
			const render = (now: DOMHighResTimeStamp) => {
				try {
					this.#render(now);
				} catch (err) {
					console.error("render error", err);
				}
				cancel = requestAnimationFrame(render);
			};

			cancel = requestAnimationFrame(render);

			effect.cleanup(() => cancelAnimationFrame(cancel));
		});
	}

	#render(now: DOMHighResTimeStamp) {
		if (!this.#glContext || !this.#backgroundRenderer) return;

		// Clear the screen
		this.#glContext.clear();

		// Render background with shader
		this.#backgroundRenderer.render(now);

		// Render broadcasts
		if (this.onRender) {
			this.onRender(now);
		}
	}

	toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			// Request fullscreen on the document element to include all UI
			document.documentElement.requestFullscreen();
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
		this.#backgroundRenderer?.cleanup();
	}
}
