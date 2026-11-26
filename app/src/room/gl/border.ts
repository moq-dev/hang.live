import type { Broadcast } from "../broadcast";
import borderFragSource from "./border.frag";
import borderVertSource from "./border.vert";
import type { Camera } from "./camera";
import type { GLContext } from "./context";
import { Meshes } from "./mesh";
import { Shader, Uniform1f, Uniform2f, Uniform4f, UniformMatrix4fv } from "./shader";

export class BorderRenderer {
	#program: Shader;
	#meshes: Meshes;

	// Typed uniforms
	#u_projection: UniformMatrix4fv;
	#u_bounds: Uniform4f;
	#u_depth: Uniform1f;
	#u_radius: Uniform1f;
	#u_size: Uniform2f;
	#u_opacity: Uniform1f;
	#u_dragPoint: Uniform2f;
	#u_velocity: Uniform2f;
	#u_dragStrength: Uniform1f;
	#u_zoomDeform: Uniform1f;
	#u_zoomCenter: Uniform2f;

	constructor(context: GLContext) {
		this.#program = new Shader(context.gl, borderVertSource, borderFragSource);

		// Initialize typed uniforms
		this.#u_projection = this.#program.createUniformMatrix4fv("u_projection");
		this.#u_bounds = this.#program.createUniform4f("u_bounds");
		this.#u_depth = this.#program.createUniform1f("u_depth");
		this.#u_radius = this.#program.createUniform1f("u_radius");
		this.#u_size = this.#program.createUniform2f("u_size");
		this.#u_opacity = this.#program.createUniform1f("u_opacity");
		this.#u_dragPoint = this.#program.createUniform2f("u_dragPoint");
		this.#u_velocity = this.#program.createUniform2f("u_velocity");
		this.#u_dragStrength = this.#program.createUniform1f("u_dragStrength");
		this.#u_zoomDeform = this.#program.createUniform1f("u_zoomDeform");
		this.#u_zoomCenter = this.#program.createUniform2f("u_zoomCenter");

		this.#meshes = new Meshes(context, this.#program.createAttribute("a_position").location);
	}

	render(broadcast: Broadcast, camera: Camera, maxZ: number) {
		const bounds = broadcast.bounds.peek();
		const scale = broadcast.zoom.peek();
		const dragPoint = broadcast.dragPoint.peek();
		const deform = broadcast.deform;
		const zoomCenter = broadcast.zoomCenter.peek();

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

		// Set drag deformation uniforms (using deformVelocity which decays separately)
		this.#u_dragPoint.set(dragPoint.x, dragPoint.y);
		this.#u_velocity.set(deform.velocity.x, deform.velocity.y);
		this.#u_dragStrength.set(0.5); // Halved for subtler effect

		// Set zoom deformation uniforms
		this.#u_zoomDeform.set(deform.zoom);
		this.#u_zoomCenter.set(zoomCenter.x, zoomCenter.y);

		this.#meshes.draw(deform.active);
	}

	close() {
		this.#meshes.close();
		this.#program.cleanup();
	}
}
