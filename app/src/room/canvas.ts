import * as Clock from "@moq/clock";
import { Effect, Signal } from "@moq/signals";
import Settings from "../settings";
import { type Bounds, Vector } from "./geometry";
import { BackgroundRenderer } from "./gl/background";
import { Camera } from "./gl/camera";
import { GLContext } from "./gl/context";

/** The installed clock's time in the timebase requestAnimationFrame passes, so fades start in step with frames. */
export function timestamp(): DOMHighResTimeStamp {
	return Clock.now().since(Clock.Instant.ZERO).asMillis();
}

// How long a tile, its video, or its meme takes to fade in or out, in milliseconds.
const FADE = 300;

/** The opacity at `now` of something fading in while `active`, or out otherwise, since `since`. */
export function fade(active: boolean, since: DOMHighResTimeStamp, now: DOMHighResTimeStamp): number {
	const progress = Math.min(1, Math.max(0, (now - since) / FADE));
	return active ? progress : 1 - progress;
}

export class Canvas {
	#canvas: HTMLCanvasElement;

	/** Whether this canvas can render with WebGL2. */
	readonly supported: boolean;

	/** The live WebGL2 context, unset while the browser has it lost or when unsupported. */
	readonly context = new Signal<GLContext | undefined>(undefined);

	/** Draws over the background every frame; while unset, the background is drawn once instead of animated. */
	readonly scene = new Signal<((now: DOMHighResTimeStamp) => void) | undefined>(undefined);

	readonly camera = new Camera();

	visible: Signal<boolean>;
	viewport: Signal<Vector>;

	// Draws one frame now, while there is a context.
	#draw?: (now: DOMHighResTimeStamp) => void;

	#signals = new Effect();

	get element() {
		return this.#canvas;
	}

	constructor(element: HTMLCanvasElement) {
		this.#canvas = element;

		this.visible = new Signal(false);
		this.viewport = new Signal(Vector.create(0, 0));

		const context = GLContext.create(this.#canvas, this.viewport);
		this.supported = context !== undefined;
		if (!context) return;
		this.context.set(context);

		// Every GPU object dies with a lost context, so drop it and build everything again once restored.
		this.#signals.event(this.#canvas, "webglcontextlost", (event) => {
			// Without this the browser never restores the context.
			event.preventDefault();
			this.context.set(undefined);
		});
		this.#signals.event(this.#canvas, "webglcontextrestored", () => {
			const restored = GLContext.create(this.#canvas, this.viewport);
			if (!restored) throw new Error("WebGL2 context restored without a context");
			this.context.set(restored);
		});

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
				this.context.peek()?.resize(newWidth, newHeight);

				// The internal logic ignores devicePixelRatio because we automatically scale when rendering.
				const viewport = Vector.create(newWidth / dpr, newHeight / dpr);
				this.viewport.set(viewport);

				// Update camera projection
				this.camera.updateOrtho(viewport);

				// Resizing clears the canvas, so draw now to avoid a black flicker.
				this.#draw?.(timestamp());
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

		this.#signals.run(this.#runRender.bind(this));

		// Free the GPU context now instead of at garbage collection, since browsers cap live contexts.
		this.#signals.cleanup(() => {
			context.gl.getExtension("WEBGL_lose_context")?.loseContext();
		});
	}

	#runRender(effect: Effect) {
		const context = effect.get(this.context);
		if (!context) return;
		effect.cleanup(() => context.close());

		const background = new BackgroundRenderer(context);
		effect.cleanup(() => background.cleanup());

		effect.run((effect) => {
			// Only render the canvas when it's visible.
			if (!effect.get(this.visible)) return;

			const scene = effect.get(this.scene);
			const draw = (now: DOMHighResTimeStamp) => {
				context.clear();
				background.render(now);
				scene?.(now);
			};

			this.#draw = draw;
			effect.cleanup(() => {
				this.#draw = undefined;
			});

			// Without a scene, the background is a still frame redrawn only on resize.
			if (!scene) {
				draw(timestamp());
				return;
			}

			let cancel: number;
			const render = (now: DOMHighResTimeStamp) => {
				try {
					draw(now);
				} catch (err) {
					console.error("render error", err);
				}
				cancel = requestAnimationFrame(render);
			};

			cancel = requestAnimationFrame(render);
			effect.cleanup(() => cancelAnimationFrame(cancel));
		});
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

	/** Where `bounds`, in canvas coordinates, sits on the page. */
	page(bounds: Bounds): DOMRect {
		const rect = this.#canvas.getBoundingClientRect();
		const viewport = this.viewport.peek();
		const scaleX = rect.width / viewport.x;
		const scaleY = rect.height / viewport.y;
		return new DOMRect(
			bounds.position.x * scaleX + rect.left,
			bounds.position.y * scaleY + rect.top,
			bounds.size.x * scaleX,
			bounds.size.y * scaleY,
		);
	}

	close() {
		this.#signals.close();
	}
}
