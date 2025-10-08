import type { Broadcast } from "../broadcast";
import { Canvas } from "../canvas";
import type { Camera } from "./camera";
import outlineFragSource from "./outline.frag?raw";
import outlineVertSource from "./outline.vert?raw";
import { Attribute, Shader, Uniform1f, Uniform2f, Uniform3f, Uniform4f, UniformMatrix4fv } from "./shader";

export class OutlineRenderer {
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
	#u_volume: Uniform1f;
	#u_border: Uniform1f;
	#u_color: Uniform3f;
	#u_time: Uniform1f;
	#u_finalAlpha: Uniform1f;

	// Typed attributes
	#a_position: Attribute;

	constructor(canvas: Canvas) {
		this.#canvas = canvas;
		this.#program = new Shader(canvas.gl, outlineVertSource, outlineFragSource);

		// Initialize typed uniforms
		this.#u_projection = this.#program.createUniformMatrix4fv("u_projection");
		this.#u_bounds = this.#program.createUniform4f("u_bounds");
		this.#u_depth = this.#program.createUniform1f("u_depth");
		this.#u_radius = this.#program.createUniform1f("u_radius");
		this.#u_size = this.#program.createUniform2f("u_size");
		this.#u_opacity = this.#program.createUniform1f("u_opacity");
		this.#u_volume = this.#program.createUniform1f("u_volume");
		this.#u_border = this.#program.createUniform1f("u_border");
		this.#u_color = this.#program.createUniform3f("u_color");
		this.#u_time = this.#program.createUniform1f("u_time");
		this.#u_finalAlpha = this.#program.createUniform1f("u_finalAlpha");

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

	render(broadcast: Broadcast, camera: Camera, maxZ: number, now: DOMHighResTimeStamp) {
		const gl = this.#canvas.gl;
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();
		const volume = broadcast.audio.volume;

		this.#program.use();

		// Set time
		this.#u_time.set(now);

		// Set projection matrix
		this.#u_projection.set(camera.projection);

		// Border size (PADDING from old implementation)
		const border = 12 * scale;

		// Expand bounds to accommodate ripple and line width
		// Line can extend: lineInset(2) + lineWidth(3) + aaWidth(2) + ripple beyond border
		const maxExpansion = border * 1.5;

		// Bounds need to include the border expansion plus ripple space
		this.#u_bounds.set(
			bounds.position.x - maxExpansion,
			bounds.position.y - maxExpansion,
			bounds.size.x + maxExpansion * 2,
			bounds.size.y + maxExpansion * 2,
		);

		// Set depth - outline should be behind ALL videos
		// Videos are in range -0.01 to 0 (based on z-index)
		// Add a tiny offset to make outlines slightly further
		const baseDepth = camera.zToDepth(broadcast.position.peek().z, maxZ);
		const depth = baseDepth - 0.02; // More negative = further away, behind all videos
		this.#u_depth.set(depth);

		// Set radius for rounded corners
		this.#u_radius.set(border);

		// Set size for SDF calculation - this is the total quad size (video + 2*maxExpansion)
		// The shader will calculate videoSize by subtracting 2*border from this
		this.#u_size.set(bounds.size.x + maxExpansion * 2, bounds.size.y + maxExpansion * 2);

		// Apply opacity based on volume and video online status
		const opacity = Math.min(10 * volume, 1) * broadcast.opacity;
		this.#u_opacity.set(opacity);

		// Set volume (smoothed, from 0-1)
		this.#u_volume.set(volume);

		// Set border size
		this.#u_border.set(border);

		// Compute final alpha once in TypeScript instead of per pixel
		const finalAlpha = 0.3 + volume * 0.4;
		this.#u_finalAlpha.set(finalAlpha);

		// Set color based on volume using HSL from old implementation
		// hue = 180 + volume * 120
		const hue = 180 + volume * 120;

		// Convert HSL to RGB
		const h = hue / 360;
		const s = 0.8;
		const l = 0.45;

		const hueToRgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		// Convert HSL to RGB
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		const r = hueToRgb(p, q, h + 1 / 3);
		const g = hueToRgb(p, q, h);
		const b = hueToRgb(p, q, h - 1 / 3);

		this.#u_color.set(r, g, b);

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
