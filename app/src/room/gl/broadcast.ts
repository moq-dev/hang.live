import type { Broadcast } from "../broadcast";
import { Canvas } from "../canvas";
import type { Camera } from "./camera";
import { Attribute, Shader, Uniform1f, Uniform1i, Uniform2f, Uniform4f, UniformMatrix4fv } from "./shader";
import broadcastFragSource from "./shaders/broadcast.frag?raw";
import broadcastVertSource from "./shaders/broadcast.vert?raw";

export class BroadcastRenderer {
	#canvas: Canvas;
	#program: Shader;
	#vao: WebGLVertexArrayObject;
	#positionBuffer: WebGLBuffer;
	#texCoordBuffer: WebGLBuffer;
	#indexBuffer: WebGLBuffer;

	// Typed uniforms
	#u_projection: UniformMatrix4fv;
	#u_bounds: Uniform4f;
	#u_depth: Uniform1f;
	#u_radius: Uniform1f;
	#u_size: Uniform2f;
	#u_opacity: Uniform1f;
	#u_avatarTransition: Uniform1f;
	#u_texture: Uniform1i;
	#u_hasTexture: Uniform1i;
	#u_avatarTexture: Uniform1i;
	#u_hasAvatar: Uniform1i;

	// Typed attributes
	#a_position: Attribute;
	#a_texCoord: Attribute;

	constructor(canvas: Canvas) {
		this.#canvas = canvas;
		this.#program = new Shader(canvas.gl, broadcastVertSource, broadcastFragSource);

		// Initialize typed uniforms
		this.#u_projection = this.#program.createUniformMatrix4fv("u_projection");
		this.#u_bounds = this.#program.createUniform4f("u_bounds");
		this.#u_depth = this.#program.createUniform1f("u_depth");
		this.#u_radius = this.#program.createUniform1f("u_radius");
		this.#u_size = this.#program.createUniform2f("u_size");
		this.#u_opacity = this.#program.createUniform1f("u_opacity");
		this.#u_avatarTransition = this.#program.createUniform1f("u_avatarTransition");
		this.#u_texture = this.#program.createUniform1i("u_texture");
		this.#u_hasTexture = this.#program.createUniform1i("u_hasTexture");
		this.#u_avatarTexture = this.#program.createUniform1i("u_avatarTexture");
		this.#u_hasAvatar = this.#program.createUniform1i("u_hasAvatar");

		// Initialize typed attributes
		this.#a_position = this.#program.createAttribute("a_position");
		this.#a_texCoord = this.#program.createAttribute("a_texCoord");

		const vao = this.#canvas.gl.createVertexArray();
		if (!vao) throw new Error("Failed to create VAO");
		this.#vao = vao;

		const positionBuffer = this.#canvas.gl.createBuffer();
		if (!positionBuffer) throw new Error("Failed to create position buffer");
		this.#positionBuffer = positionBuffer;

		const texCoordBuffer = this.#canvas.gl.createBuffer();
		if (!texCoordBuffer) throw new Error("Failed to create texCoord buffer");
		this.#texCoordBuffer = texCoordBuffer;

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

		// Texture coordinates
		const texCoords = new Float32Array([
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

		// TexCoord attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.#a_texCoord.location);
		gl.vertexAttribPointer(this.#a_texCoord.location, 2, gl.FLOAT, false, 0, 0);

		// Index buffer
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

		gl.bindVertexArray(null);
	}

	render(
		broadcast: Broadcast,
		camera: Camera,
		maxZ: number,
		modifiers?: {
			dragging?: boolean;
			hovering?: boolean;
		},
	) {
		const gl = this.#canvas.gl;
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();

		this.#program.use();

		// Set projection matrix
		this.#u_projection.set(camera.projection);

		// Set bounds (x, y, width, height)
		this.#u_bounds.set(bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y);

		// Set depth based on z-index
		const depth = camera.zToDepth(broadcast.position.peek().z, maxZ);
		this.#u_depth.set(depth);

		// Set radius for rounded corners
		const radius = 12 * scale;
		this.#u_radius.set(radius);

		// Set size for SDF calculation
		this.#u_size.set(bounds.size.x, bounds.size.y);

		// Set opacity
		let opacity = broadcast.video.online;
		if (modifiers?.dragging) {
			opacity *= 0.7;
		}
		this.#u_opacity.set(opacity);

		// Set avatar transition (0 = avatar, 1 = video)
		this.#u_avatarTransition.set(broadcast.video.avatarTransition);

		// Bind video texture if available
		const texture = broadcast.video.texture;
		if (texture) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			this.#u_texture.set(0);
			this.#u_hasTexture.set(1);
		} else {
			this.#u_hasTexture.set(0);
		}

		// Bind avatar texture if available
		const avatarTexture = broadcast.video.avatarTexture;
		if (avatarTexture) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, avatarTexture);
			this.#u_avatarTexture.set(1);
			this.#u_hasAvatar.set(1);
		} else {
			this.#u_hasAvatar.set(0);
		}

		// Draw
		gl.bindVertexArray(this.#vao);
		gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	cleanup() {
		const gl = this.#canvas.gl;
		gl.deleteVertexArray(this.#vao);
		gl.deleteBuffer(this.#positionBuffer);
		gl.deleteBuffer(this.#texCoordBuffer);
		gl.deleteBuffer(this.#indexBuffer);
		this.#program.cleanup();
	}
}
