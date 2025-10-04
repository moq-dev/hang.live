import type { Broadcast } from "../broadcast";
import type { Camera } from "./camera";
import type { GLContext } from "./context";
import { ShaderProgram } from "./shader";
import broadcastVertSource from "./shaders/broadcast.vert?raw";
import broadcastFragSource from "./shaders/broadcast.frag?raw";

export class BroadcastRenderer {
	#glContext: GLContext;
	#program: ShaderProgram;
	#vao: WebGLVertexArrayObject;
	#positionBuffer: WebGLBuffer;
	#texCoordBuffer: WebGLBuffer;
	#indexBuffer: WebGLBuffer;

	constructor(glContext: GLContext) {
		this.#glContext = glContext;
		const gl = glContext.gl;

		this.#program = new ShaderProgram(gl, broadcastVertSource, broadcastFragSource);

		const vao = gl.createVertexArray();
		if (!vao) throw new Error("Failed to create VAO");
		this.#vao = vao;

		const positionBuffer = gl.createBuffer();
		if (!positionBuffer) throw new Error("Failed to create position buffer");
		this.#positionBuffer = positionBuffer;

		const texCoordBuffer = gl.createBuffer();
		if (!texCoordBuffer) throw new Error("Failed to create texCoord buffer");
		this.#texCoordBuffer = texCoordBuffer;

		const indexBuffer = gl.createBuffer();
		if (!indexBuffer) throw new Error("Failed to create index buffer");
		this.#indexBuffer = indexBuffer;

		this.#setupBuffers();
	}

	#setupBuffers() {
		const gl = this.#glContext.gl;

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
		const posLoc = this.#program.getAttribute("a_position");
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		// TexCoord attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
		const texCoordLoc = this.#program.getAttribute("a_texCoord");
		gl.enableVertexAttribArray(texCoordLoc);
		gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

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
		const gl = this.#glContext.gl;
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();

		this.#program.use();

		// Set projection matrix
		this.#program.setUniformMatrix4fv("u_projection", camera.projection);

		// Set bounds (x, y, width, height)
		this.#program.setUniform4f("u_bounds", bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y);

		// Set depth based on z-index
		const depth = camera.zToDepth(broadcast.position.peek().z, maxZ);
		this.#program.setUniform1f("u_depth", depth);

		// Set radius for rounded corners
		const radius = 12 * scale;
		this.#program.setUniform1f("u_radius", radius);

		// Set size for SDF calculation
		this.#program.setUniform2f("u_size", bounds.size.x, bounds.size.y);

		// Set opacity
		let opacity = broadcast.video.online;
		if (modifiers?.dragging) {
			opacity *= 0.7;
		}
		this.#program.setUniform1f("u_opacity", opacity);

		// Set avatar transition (0 = avatar, 1 = video)
		this.#program.setUniform1f("u_avatarTransition", broadcast.video.avatarTransition);

		// Bind video texture if available
		const texture = broadcast.video.texture;
		if (texture) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			this.#program.setUniform1i("u_texture", 0);
			this.#program.setUniform1i("u_hasTexture", 1);
		} else {
			this.#program.setUniform1i("u_hasTexture", 0);
		}

		// Bind avatar texture if available
		const avatarTexture = broadcast.video.avatarTexture;
		if (avatarTexture) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, avatarTexture);
			this.#program.setUniform1i("u_avatarTexture", 1);
			this.#program.setUniform1i("u_hasAvatar", 1);
		} else {
			this.#program.setUniform1i("u_hasAvatar", 0);
		}

		// Draw
		gl.bindVertexArray(this.#vao);
		gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	cleanup() {
		const gl = this.#glContext.gl;
		gl.deleteVertexArray(this.#vao);
		gl.deleteBuffer(this.#positionBuffer);
		gl.deleteBuffer(this.#texCoordBuffer);
		gl.deleteBuffer(this.#indexBuffer);
		this.#program.cleanup();
	}
}
