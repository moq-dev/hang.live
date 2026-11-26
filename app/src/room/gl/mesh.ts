import type { GLContext } from "./context";

/** A static square grid over the unit square, uploaded once and shared by every tile. */
export class Mesh {
	readonly vertices: WebGLBuffer;
	readonly indices: WebGLBuffer;
	readonly count: number;
	#gl: WebGL2RenderingContext;

	/** Upload a grid of `cells` by `cells` squares; a single cell is a plain quad. */
	constructor(gl: WebGL2RenderingContext, cells: number) {
		this.#gl = gl;

		const row = cells + 1;
		const vertices = new Float32Array(row * row * 2);
		for (let y = 0; y <= cells; y++) {
			for (let x = 0; x <= cells; x++) {
				const i = (y * row + x) * 2;
				vertices[i] = x / cells;
				vertices[i + 1] = y / cells;
			}
		}

		const indices = new Uint16Array(cells * cells * 6);
		let i = 0;
		for (let y = 0; y < cells; y++) {
			for (let x = 0; x < cells; x++) {
				const topLeft = y * row + x;
				const topRight = topLeft + 1;
				const bottomLeft = topLeft + row;
				const bottomRight = bottomLeft + 1;
				indices.set([topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft], i);
				i += 6;
			}
		}
		this.count = indices.length;

		this.vertices = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.indices = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	}

	close() {
		this.#gl.deleteBuffer(this.vertices);
		this.#gl.deleteBuffer(this.indices);
	}
}

/** One program's vertex arrays for the shared quad and grid. */
export class Meshes {
	#context: GLContext;
	#quad: WebGLVertexArrayObject;
	#grid: WebGLVertexArrayObject;

	/** Bind both shared meshes to the program's `a_position` attribute at `position`. */
	constructor(context: GLContext, position: number) {
		this.#context = context;
		this.#quad = this.#bind(context.quad, position);
		this.#grid = this.#bind(context.grid, position);
	}

	#bind(mesh: Mesh, position: number): WebGLVertexArrayObject {
		const gl = this.#context.gl;
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices);
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
		gl.bindVertexArray(null);
		return vao;
	}

	/** Draw the grid while the tile wobbles, so it bends smoothly, and the plain quad otherwise. */
	draw(deformed: boolean) {
		const gl = this.#context.gl;
		const mesh = deformed ? this.#context.grid : this.#context.quad;
		gl.bindVertexArray(deformed ? this.#grid : this.#quad);
		gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	close() {
		const gl = this.#context.gl;
		gl.deleteVertexArray(this.#quad);
		gl.deleteVertexArray(this.#grid);
	}
}
