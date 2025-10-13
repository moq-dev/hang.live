import type { Broadcast } from "../broadcast";
import { Canvas } from "../canvas";
import broadcastFragSource from "./broadcast.frag";
import broadcastVertSource from "./broadcast.vert";
import type { Camera } from "./camera";
import type { MeshBuffer } from "./mesh";
import { Attribute, Shader, Uniform1f, Uniform1i, Uniform2f, Uniform3f, Uniform4f, UniformMatrix4fv } from "./shader";

export class BroadcastRenderer {
	#canvas: Canvas;
	#program: Shader;
	#vaos = new Map<MeshBuffer, WebGLVertexArrayObject>();

	// Typed uniforms
	#u_projection: UniformMatrix4fv;
	#u_bounds: Uniform4f;
	#u_depth: Uniform1f;
	#u_radius: Uniform1f;
	#u_size: Uniform2f;
	#u_opacity: Uniform1f;
	#u_frameOpacity: Uniform1f;
	#u_frameTexture: Uniform1i;
	#u_avatarTexture: Uniform1i;
	#u_avatarActive: Uniform1i;
	#u_memeTexture: Uniform1i;
	#u_memeOpacity: Uniform1f;
	#u_memeBounds: Uniform4f;
	#u_memeChromaKey: Uniform1i;
	#u_memeChromaColor: Uniform3f;
	#u_flip: Uniform1i;
	#u_dragPoint: Uniform2f;
	#u_velocity: Uniform2f;
	#u_dragStrength: Uniform1f;
	#u_zoomDeform: Uniform1f;
	#u_zoomCenter: Uniform2f;

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
		this.#u_frameOpacity = this.#program.createUniform1f("u_frameOpacity");
		this.#u_frameTexture = this.#program.createUniform1i("u_frameTexture");
		this.#u_avatarTexture = this.#program.createUniform1i("u_avatarTexture");
		this.#u_avatarActive = this.#program.createUniform1i("u_avatarActive");
		this.#u_memeTexture = this.#program.createUniform1i("u_memeTexture");
		this.#u_memeOpacity = this.#program.createUniform1f("u_memeOpacity");
		this.#u_memeBounds = this.#program.createUniform4f("u_memeBounds");
		this.#u_memeChromaKey = this.#program.createUniform1i("u_memeChromaKey");
		this.#u_memeChromaColor = this.#program.createUniform3f("u_memeChromaColor");
		this.#u_flip = this.#program.createUniform1i("u_flip");
		this.#u_dragPoint = this.#program.createUniform2f("u_dragPoint");
		this.#u_velocity = this.#program.createUniform2f("u_velocity");
		this.#u_dragStrength = this.#program.createUniform1f("u_dragStrength");
		this.#u_zoomDeform = this.#program.createUniform1f("u_zoomDeform");
		this.#u_zoomCenter = this.#program.createUniform2f("u_zoomCenter");

		// Initialize typed attributes
		this.#a_position = this.#program.createAttribute("a_position");
		this.#a_texCoord = this.#program.createAttribute("a_texCoord");
	}

	#getOrCreateVAO(mesh: MeshBuffer): WebGLVertexArrayObject {
		let vao = this.#vaos.get(mesh);
		if (vao) return vao;

		const gl = this.#canvas.gl;
		vao = gl.createVertexArray();
		if (!vao) throw new Error("Failed to create VAO");

		gl.bindVertexArray(vao);

		// Position attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
		gl.enableVertexAttribArray(this.#a_position.location);
		gl.vertexAttribPointer(this.#a_position.location, 2, gl.FLOAT, false, 0, 0);

		// TexCoord attribute
		gl.bindBuffer(gl.ARRAY_BUFFER, mesh.texCoordBuffer);
		gl.enableVertexAttribArray(this.#a_texCoord.location);
		gl.vertexAttribPointer(this.#a_texCoord.location, 2, gl.FLOAT, false, 0, 0);

		// Index buffer
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

		gl.bindVertexArray(null);

		this.#vaos.set(mesh, vao);
		return vao;
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
		this.#program.use();

		const gl = this.#canvas.gl;
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();
		const dragPoint = broadcast.dragPoint.peek();
		const deformVelocity = broadcast.deformVelocity;
		const zoomCenter = broadcast.zoomCenter.peek();

		// Get or create VAO for this broadcast's mesh
		const vao = this.#getOrCreateVAO(broadcast.mesh);

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

		// Set drag deformation uniforms (using deformVelocity which decays separately)
		this.#u_dragPoint.set(dragPoint.x, dragPoint.y);
		this.#u_velocity.set(deformVelocity.x, deformVelocity.y);
		this.#u_dragStrength.set(0.5); // Halved for subtler effect

		// Set zoom deformation uniforms
		this.#u_zoomDeform.set(broadcast.zoomDeform);
		this.#u_zoomCenter.set(zoomCenter.x, zoomCenter.y);

		// Set opacity
		let opacity = broadcast.opacity;
		if (modifiers?.dragging) {
			opacity *= 0.7;
		}

		this.#u_opacity.set(opacity);

		// Set pre-computed opacity values
		this.#u_frameOpacity.set(broadcast.video.frameOpacity);
		this.#u_memeOpacity.set(broadcast.video.memeOpacity);

		// Set flip flag
		this.#u_flip.set(broadcast.video.flip.peek() ? 1 : 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, broadcast.video.frameTexture);
		this.#u_frameTexture.set(0);

		// Bind avatar texture if available
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, broadcast.video.avatarTexture);
		this.#u_avatarTexture.set(1);
		this.#u_avatarActive.set(broadcast.video.avatarSize ? 1 : 0);

		// Bind meme texture if available
		const memeTexture = broadcast.video.memeTexture;
		const memeBounds = broadcast.video.memeBounds;

		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, memeTexture);
		this.#u_memeTexture.set(2);

		if (memeBounds) {
			this.#u_memeBounds.set(memeBounds.position.x, memeBounds.position.y, memeBounds.size.x, memeBounds.size.y);
		}

		// Set chroma key color
		const chroma = broadcast.video.memeChroma;
		if (chroma) {
			this.#u_memeChromaKey.set(chroma ? 1 : 0);
			this.#u_memeChromaColor.set(chroma?.r, chroma?.g, chroma?.b);
		} else {
			this.#u_memeChromaKey.set(0);
		}

		// Draw
		gl.bindVertexArray(vao);
		gl.drawElements(gl.TRIANGLES, broadcast.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	close() {
		const gl = this.#canvas.gl;
		for (const vao of this.#vaos.values()) {
			gl.deleteVertexArray(vao);
		}
		this.#vaos.clear();
		this.#program.cleanup();
	}
}
