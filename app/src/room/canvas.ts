import { Effect, Signal } from "@kixelated/signals";
import { Vector } from "./geometry";
import { BackgroundRenderer } from "./gl/background";
import { Camera } from "./gl/camera";
import { GLContext } from "./gl/context";

export type CanvasProps = {
	demo?: boolean;
};

export class Canvas {
	#canvas: HTMLCanvasElement;
	#glContext: GLContext;
	#camera: Camera;
	#backgroundRenderer: BackgroundRenderer;

	// Use a callback to render after the background.
	onRender?: (now: DOMHighResTimeStamp) => void;
	#animate?: number;

	visible: Signal<boolean>;
	viewport: Signal<Vector>;
	demo: Signal<boolean>;

	#signals = new Effect();

	get element() {
		return this.#canvas;
	}

	get gl(): WebGL2RenderingContext {
		return this.#glContext.gl;
	}

	get glContext(): GLContext {
		return this.#glContext;
	}

	get camera() {
		return this.#camera;
	}

	constructor(element: HTMLCanvasElement, props?: CanvasProps) {
		this.#canvas = element;

		this.demo = new Signal(props?.demo ?? false);
		this.visible = new Signal(false);
		this.viewport = new Signal(Vector.create(0, 0));

		// Initialize WebGL2 context
		this.#glContext = new GLContext(this.#canvas, this.viewport);
		this.#camera = new Camera();
		this.#backgroundRenderer = new BackgroundRenderer(this.#glContext);

		const resize = (entries: ResizeObserverEntry[]) => {
			for (const entry of entries) {
				// Get device pixel dimensions
				const dpr = window.devicePixelRatio;
				const width = entry.devicePixelContentBoxSize?.[0].inlineSize ??
					entry.contentBoxSize[0].inlineSize * dpr;
				const height = entry.devicePixelContentBoxSize?.[0].blockSize ??
					entry.contentBoxSize[0].blockSize * dpr;

				const newWidth = Math.max(1, Math.floor(width));
				const newHeight = Math.max(1, Math.floor(height));

				// Only update canvas if dimensions actually changed
				if (this.#canvas.width === newWidth && this.#canvas.height === newHeight) {
					return;
				}

				this.#canvas.width = newWidth;
				this.#canvas.height = newHeight;

				// Update WebGL viewport
				this.#glContext.resize(newWidth, newHeight);

				// The internal logic ignores devicePixelRatio because we automatically scale when rendering.
				const viewport = Vector.create(newWidth / dpr, newHeight / dpr);
				this.viewport.set(viewport);

				// Update camera projection
				this.#camera.updateOrtho(viewport);

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
		const resizeObserver = new ResizeObserver(resize);
		try {
			// Try to observe device-pixel-content-box for pixel-perfect sizing
			resizeObserver.observe(this.#canvas, { box: "device-pixel-content-box" });
		} catch {
			// Fallback to content-box if device-pixel-content-box is not supported
			resizeObserver.observe(this.#canvas, { box: "content-box" });
		}

		this.#signals.event(document, "visibilitychange", visible);

		this.#signals.cleanup(() => {
			resizeObserver.disconnect();
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
		// Update common uniforms for this frame
		this.#glContext.uniforms.update(now);

		// Clear the screen
		this.#glContext.clear();

		// Render background with shader
		this.#backgroundRenderer.render();

		// TODO: Render demo text if enabled
		// if (this.demo.peek()) {
		// 	this.#renderDemo(now);
		// }

		// Render broadcasts
		if (this.onRender) {
			try {
				this.onRender(now);
			} catch (err) {
				console.error("render error", err);
			}
		}

		this.#animate = requestAnimationFrame(this.#render.bind(this));
	}

	// TODO: Implement demo text rendering with WebGL
	// #renderDemo(now: DOMHighResTimeStamp) {
	// 	// Render "DEMO" text at various positions
	// }

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
		this.#backgroundRenderer.cleanup();
	}
}
