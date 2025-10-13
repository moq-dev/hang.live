#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

uniform mat4 u_projection;
uniform vec4 u_bounds; // x, y, width, height
uniform float u_depth;
uniform vec2 u_dragPoint; // Normalized drag point (0-1) relative to broadcast
uniform vec2 u_velocity; // Current velocity vector
uniform float u_dragStrength; // Strength multiplier for drag effect
uniform float u_zoomDeform; // Zoom deformation (positive = expanding, negative = contracting)
uniform vec2 u_zoomCenter; // Normalized zoom center (0-1) relative to broadcast

out vec2 v_texCoord;
out vec2 v_pos; // Position within the quad (0-1)

void main() {
	// Start with base vertex position (0-1 range)
	vec2 vertexPos = a_position;

	// Calculate zoom deformation (radial expansion/contraction from zoom center)
	if (abs(u_zoomDeform) > 0.001) {
		// Distance from zoom center
		vec2 fromCenter = vertexPos - u_zoomCenter;
		float distFromCenter = length(fromCenter);

		// Stronger effect in the middle, weaker at edges
		// Use a smooth curve: effect decreases as we move away from center
		// At center (dist=0): full effect
		// At corners (dist~0.7): minimal effect
		float zoomFalloff = 1.0 - smoothstep(0.0, 0.7, distFromCenter);

		// Apply radial deformation in normalized space
		// This pushes vertices away from/toward center based on zoom direction
		vertexPos += fromCenter * u_zoomDeform * zoomFalloff * 0.3;
	}

	// Now apply drag deformation in pixel space
	vec2 deformation = vec2(0.0);

	if (length(u_velocity) > 0.0) {
		// Distance from this vertex to the drag point
		float dist = distance(vertexPos, u_dragPoint);

		// Falloff: stronger near drag point, weaker far away
		// Using exponential falloff for smooth, natural feel
		// Reduced from 3.0 to 1.5 for smoother, more spread out effect
		float falloff = exp(-dist * 1.5);

		// Apply velocity-based displacement with falloff
		deformation = u_velocity * falloff * u_dragStrength;
	}

	// Scale and translate to bounds, with deformation applied in pixel space
	vec2 pos = vertexPos * u_bounds.zw + u_bounds.xy + deformation;

	// Apply projection
	gl_Position = u_projection * vec4(pos, u_depth, 1.0);

	v_texCoord = a_texCoord;
	v_pos = a_position;
}
