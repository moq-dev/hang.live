import { Signal } from "@moq/signals";
import { Vector } from "../geometry";
import { Mesh } from "./mesh";

// Cells per side of the mesh a wobbling tile bends on.
const GRID_CELLS = 20;

/** A live WebGL2 context and the GPU state every renderer shares; a lost context gets a new one. */
export class GLContext {
	gl: WebGL2RenderingContext;
	viewport: Signal<Vector>;

	/** The plain quad most tiles draw with. */
	quad: Mesh;
	/** The subdivided grid a wobbling tile draws with. */
	grid: Mesh;

	/** Create a context when the browser supports WebGL2, also after the previous one was restored. */
	static create(canvas: HTMLCanvasElement, viewport: Signal<Vector>): GLContext | undefined {
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: true,
			depth: true,
			premultipliedAlpha: false,
		});

		if (!gl) return;
		return new GLContext(gl, viewport);
	}

	private constructor(gl: WebGL2RenderingContext, viewport: Signal<Vector>) {
		this.gl = gl;
		this.viewport = viewport;

		// A restored context starts from defaults, so match the current canvas size.
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

		// Enable depth testing for z-index ordering
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		// Enable blending for transparency
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this.quad = new Mesh(gl, 1);
		this.grid = new Mesh(gl, GRID_CELLS);
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

	close() {
		this.quad.close();
		this.grid.close();
	}
}
