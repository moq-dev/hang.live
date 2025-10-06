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

		const resize = () => {
			// Check if we're in fullscreen or fixed position
			const isFullscreen = document.fullscreenElement === this.#canvas;
			const style = window.getComputedStyle(this.#canvas);
			const isFixed = style.position === "fixed";

			let newWidth: number;
			let newHeight: number;

			if (isFullscreen || isFixed) {
				// Use window dimensions for fullscreen or fixed position
				newWidth = window.innerWidth;
				newHeight = window.innerHeight;
			} else {
				// Use parent container dimensions
				const parent = this.#canvas.parentElement;
				if (!parent) return;

				const rect = parent.getBoundingClientRect();
				newWidth = rect.width;
				newHeight = rect.height;
			}

			newWidth *= window.devicePixelRatio;
			newHeight *= window.devicePixelRatio;

			// Only update canvas if dimensions actually changed
			// This prevents the canvas from being cleared when layout changes don't affect size
			if (this.#canvas.width === newWidth && this.#canvas.height === newHeight) {
				return;
			}

			this.#canvas.width = newWidth;
			this.#canvas.height = newHeight;

			// Update WebGL viewport
			this.#glContext.resize(newWidth, newHeight);

			// The internal logic ignores devicePixelRatio because we automatically scale when rendering.
			const viewport = Vector.create(
				this.#canvas.width / window.devicePixelRatio,
				this.#canvas.height / window.devicePixelRatio,
			);
			this.viewport.set(viewport);

			// Update camera projection
			this.#camera.updateOrtho(viewport);
		};

		let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

		const scheduleResize = () => {
			// Clear any existing timeout
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}

			// Debounce resize to prevent flickering during rapid changes
			resizeTimeout = setTimeout(() => {
				resize();
				resizeTimeout = undefined;
			}, 50);
		};

		const visible = () => {
			this.visible.set(document.visibilityState !== "hidden");
		};

		visible();

		// Set up ResizeObserver for parent when canvas is added to DOM
		let resizeObserver: ResizeObserver | null = null;

		const setupParentObserver = () => {
			const parent = this.#canvas.parentElement;
			if (parent && !resizeObserver) {
				resizeObserver = new ResizeObserver(scheduleResize);
				resizeObserver.observe(parent);
				resize();
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

		this.#signals.event(document, "visibilitychange", visible);

		this.#signals.cleanup(() => {
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			mutationObserver.disconnect();
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
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
		// Clear the screen
		this.#glContext.clear();

		// Render background with shader
		this.#backgroundRenderer.render(now);

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
