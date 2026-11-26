import type { Broadcast } from "../broadcast";
import broadcastFragSource from "./broadcast.frag";
import broadcastVertSource from "./broadcast.vert";
import type { Camera } from "./camera";
import type { GLContext } from "./context";
import { Meshes } from "./mesh";
import {
	Shader,
	type Uniform1f,
	type Uniform1i,
	type Uniform2f,
	type Uniform4f,
	type UniformMatrix4fv,
} from "./shader";

export class BroadcastRenderer {
	#context: GLContext;
	#program: Shader;
	#meshes: Meshes;

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
	#u_flip: Uniform1i;
	#u_dragPoint: Uniform2f;
	#u_velocity: Uniform2f;
	#u_dragStrength: Uniform1f;
	#u_zoomDeform: Uniform1f;
	#u_zoomCenter: Uniform2f;

	constructor(context: GLContext) {
		this.#context = context;
		this.#program = new Shader(context.gl, broadcastVertSource, broadcastFragSource);

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
		this.#u_flip = this.#program.createUniform1i("u_flip");
		this.#u_dragPoint = this.#program.createUniform2f("u_dragPoint");
		this.#u_velocity = this.#program.createUniform2f("u_velocity");
		this.#u_dragStrength = this.#program.createUniform1f("u_dragStrength");
		this.#u_zoomDeform = this.#program.createUniform1f("u_zoomDeform");
		this.#u_zoomCenter = this.#program.createUniform2f("u_zoomCenter");

		this.#meshes = new Meshes(context, this.#program.createAttribute("a_position").location);
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
		const textures = broadcast.video.textures.peek();
		if (!textures) return;

		this.#program.use();

		const gl = this.#context.gl;
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();
		const dragPoint = broadcast.dragPoint.peek();
		const deform = broadcast.deform;
		const zoomCenter = broadcast.zoomCenter.peek();

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
		this.#u_velocity.set(deform.velocity.x, deform.velocity.y);
		this.#u_dragStrength.set(0.5); // Halved for subtler effect

		// Set zoom deformation uniforms
		this.#u_zoomDeform.set(deform.zoom);
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
		this.#u_flip.set(broadcast.source.video.flip.peek() ? 1 : 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, textures.frame);
		this.#u_frameTexture.set(0);

		// Bind avatar texture if available
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, textures.avatar);
		this.#u_avatarTexture.set(1);
		this.#u_avatarActive.set(broadcast.video.avatarSize.peek() ? 1 : 0);

		// Bind meme texture if available
		const memeBounds = broadcast.video.memeBounds.peek();

		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, textures.meme);
		this.#u_memeTexture.set(2);

		if (memeBounds) {
			this.#u_memeBounds.set(memeBounds.position.x, memeBounds.position.y, memeBounds.size.x, memeBounds.size.y);
		}

		// Set chroma key flag
		this.#u_memeChromaKey.set(broadcast.video.memeChroma ? 1 : 0);

		this.#meshes.draw(deform.active);
	}

	close() {
		this.#meshes.close();
		this.#program.cleanup();
	}
}
