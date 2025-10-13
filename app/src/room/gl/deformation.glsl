// Shared deformation constants and functions for vertex shaders
// Used across border, broadcast, and audio renderers

// Deformation strength constants
const float ZOOM_FALLOFF_DISTANCE = 0.7;
const float ZOOM_DEFORM_STRENGTH = 0.3;
const float DRAG_FALLOFF_RATE = 1.5;

// Apply mesh deformation based on drag and zoom
// vertexPos: vertex position in normalized coordinates (0-1)
// u_dragPoint: normalized drag point (0-1) relative to broadcast
// u_velocity: current velocity vector in pixels
// u_dragStrength: strength multiplier for drag effect
// u_zoomDeform: zoom deformation (positive = expanding, negative = contracting)
// u_zoomCenter: normalized zoom center (0-1) relative to broadcast
// u_bounds: bounds in pixel space (x, y, width, height)
// Returns: deformed position in pixel space
vec2 applyDeformation(
	vec2 vertexPos,
	vec2 u_dragPoint,
	vec2 u_velocity,
	float u_dragStrength,
	float u_zoomDeform,
	vec2 u_zoomCenter,
	vec4 u_bounds
) {
	// Calculate zoom deformation (radial expansion/contraction from zoom center)
	if (abs(u_zoomDeform) > 0.001) {
		// Distance from zoom center
		vec2 fromCenter = vertexPos - u_zoomCenter;
		float distFromCenter = length(fromCenter);

		// Stronger effect in the middle, weaker at edges
		// Use a smooth curve: effect decreases as we move away from center
		// At center (dist=0): full effect
		// At corners (dist~0.7): minimal effect
		float zoomFalloff = 1.0 - smoothstep(0.0, ZOOM_FALLOFF_DISTANCE, distFromCenter);

		// Apply radial deformation in normalized space
		// This pushes vertices away from/toward center based on zoom direction
		vertexPos += fromCenter * u_zoomDeform * zoomFalloff * ZOOM_DEFORM_STRENGTH;
	}

	// Now apply drag deformation in pixel space
	vec2 deformation = vec2(0.0);

	if (length(u_velocity) > 0.0) {
		// Distance from this vertex to the drag point
		float dist = distance(vertexPos, u_dragPoint);

		// Falloff: stronger near drag point, weaker far away
		// Using exponential falloff for smooth, natural feel
		float falloff = exp(-dist * DRAG_FALLOFF_RATE);

		// Apply velocity-based displacement with falloff
		deformation = u_velocity * falloff * u_dragStrength;
	}

	// Scale and translate to bounds, with deformation applied in pixel space
	return vertexPos * u_bounds.zw + u_bounds.xy + deformation;
}
