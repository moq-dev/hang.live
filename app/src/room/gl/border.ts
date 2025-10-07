import type { Broadcast } from "../broadcast";
import { Canvas } from "../canvas";
import type { Camera } from "./camera";
import { Attribute, Shader, Uniform1f, Uniform2f, Uniform4f, UniformMatrix4fv } from "./shader";
import borderFragSource from "./shaders/border.frag?raw";
import borderVertSource from "./shaders/border.vert?raw";

export class BorderRenderer {
	#canvas: Canvas;
	#program: Shader;
	#vao: WebGLVertexArrayObject;
	#positionBuffer: WebGLBuffer;
	#indexBuffer: WebGLBuffer;

	// Typed uniforms
	#u_projection: UniformMatrix4fv;
	#u_bounds: Uniform4f;
	#u_depth: Uniform1f;
	#u_radius: Uniform1f;
	#u_size: Uniform2f;
	#u_opacity: Uniform1f;

	// Typed attributes
	#a_position: Attribute;

	constructor(canvas: Canvas) {
		this.#canvas = canvas;
		this.#program = new Shader(canvas.gl, borderVertSource, borderFragSource);

		// Initialize typed uniforms
		this.#u_projection = this.#program.createUniformMatrix4fv("u_projection");
		this.#u_bounds = this.#program.createUniform4f("u_bounds");
		this.#u_depth = this.#program.createUniform1f("u_depth");
		this.#u_radius = this.#program.createUniform1f("u_radius");
		this.#u_size = this.#program.createUniform2f("u_size");
		this.#u_opacity = this.#program.createUniform1f("u_opacity");

		// Initialize typed attributes
		this.#a_position = this.#program.createAttribute("a_position");

		const vao = this.#canvas.gl.createVertexArray();
		if (!vao) throw new Error("Failed to create VAO");
		this.#vao = vao;

		const positionBuffer = this.#canvas.gl.createBuffer();
		if (!positionBuffer) throw new Error("Failed to create position buffer");
		this.#positionBuffer = positionBuffer;

		const indexBuffer = this.#canvas.gl.createBuffer();
		if (!indexBuffer) throw new Error("Failed to create index buffer");
		this.#indexBuffer = indexBuffer;

		this.#setupBuffers();
	}

	#setupBuffers() {
		const gl = this.#canvas.gl;

		// Quad vertices (0-1 range, will be scaled by bounds)
		const positions = new Float32Array([
			0,
			0, // Top-left
			1,
			0, // Top-right
			1,
			1, // Bottom-right
			0,
			1, // Bottom-left
		]);

		// Indices for two triangles
		const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

		gl.bindVertexArray(this.#vao);

		// Position attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.#a_position.location);
		gl.vertexAttribPointer(this.#a_position.location, 2, gl.FLOAT, false, 0, 0);

		// Index buffer
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

		gl.bindVertexArray(null);
	}

	render(broadcast: Broadcast, camera: Camera, maxZ: number) {
		const gl = this.#canvas.gl;
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();

		this.#program.use();

		// Set projection matrix
		this.#u_projection.set(camera.projection);

		// Border size (PADDING from old implementation)
		const border = 12 * scale;

		// Bounds need to include the border expansion
		this.#u_bounds.set(
			bounds.position.x - border,
			bounds.position.y - border,
			bounds.size.x + border * 2,
			bounds.size.y + border * 2,
		);

		// Set depth - borders should be behind everything
		const baseDepth = camera.zToDepth(broadcast.position.peek().z, maxZ);
		const depth = baseDepth - 0.04; // Further behind than audio viz
		this.#u_depth.set(depth);

		// Set radius for rounded corners
		this.#u_radius.set(border);

		// Set size for SDF calculation
		this.#u_size.set(bounds.size.x + border * 2, bounds.size.y + border * 2);

		// Set opacity
		this.#u_opacity.set(broadcast.opacity);

		// Draw
		gl.bindVertexArray(this.#vao);
		gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	close() {
		const gl = this.#canvas.gl;
		gl.deleteVertexArray(this.#vao);
		gl.deleteBuffer(this.#positionBuffer);
		gl.deleteBuffer(this.#indexBuffer);
		this.#program.cleanup();
	}
}
