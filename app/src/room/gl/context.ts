import { Signal } from "@moq/signals";
import { Vector } from "../geometry";

export class GLContext {
	gl: WebGL2RenderingContext;
	canvas: HTMLCanvasElement;
	viewport: Signal<Vector>;

	/** Create a context when the browser supports WebGL2. */
	static create(canvas: HTMLCanvasElement, viewport: Signal<Vector>): GLContext | undefined {
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: true,
			depth: true,
			premultipliedAlpha: false,
		});

		if (!gl) return;
		return new GLContext(canvas, viewport, gl);
	}

	private constructor(canvas: HTMLCanvasElement, viewport: Signal<Vector>, gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.canvas = canvas;
		this.viewport = viewport;

		// Enable depth testing for z-index ordering
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		// Enable blending for transparency
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	}

	clear() {
		const gl = this.gl;
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	resize(width: number, height: number) {
		const gl = this.gl;
		gl.viewport(0, 0, width, height);
	}
}
