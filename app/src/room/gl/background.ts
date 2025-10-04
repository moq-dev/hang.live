import type { GLContext } from "./context";
import { ShaderProgram } from "./shader";
import backgroundVertSource from "./shaders/background.vert?raw";
import backgroundFragSource from "./shaders/background.frag?raw";

export class BackgroundRenderer {
	#glContext: GLContext;
	#program: ShaderProgram;
	#vao: WebGLVertexArrayObject;
	#positionBuffer: WebGLBuffer;

	constructor(glContext: GLContext) {
		this.#glContext = glContext;
		const gl = glContext.gl;

		this.#program = new ShaderProgram(gl, backgroundVertSource, backgroundFragSource);

		const vao = gl.createVertexArray();
		if (!vao) throw new Error("Failed to create VAO");
		this.#vao = vao;

		const positionBuffer = gl.createBuffer();
		if (!positionBuffer) throw new Error("Failed to create position buffer");
		this.#positionBuffer = positionBuffer;

		this.#setupQuad();
	}

	#setupQuad() {
		const gl = this.#glContext.gl;

		// Fullscreen quad vertices (clip space)
		const positions = new Float32Array([
			-1.0, -1.0,
			1.0, -1.0,
			-1.0, 1.0,
			1.0, 1.0,
		]);

		gl.bindVertexArray(this.#vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

		const posLoc = this.#program.getAttribute("a_position");
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);
	}

	render(now: DOMHighResTimeStamp) {
		const gl = this.#glContext.gl;
		const viewport = this.#glContext.viewport.peek();

		this.#program.use();
		this.#program.setUniform2f("u_resolution", viewport.x, viewport.y);
		this.#program.setUniform1f("u_time", now);

		gl.bindVertexArray(this.#vao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindVertexArray(null);
	}

	cleanup() {
		const gl = this.#glContext.gl;
		gl.deleteVertexArray(this.#vao);
		gl.deleteBuffer(this.#positionBuffer);
		this.#program.cleanup();
	}
}
