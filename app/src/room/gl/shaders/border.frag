#version 300 es
precision highp float;

in vec2 v_pos;

uniform float u_radius;
uniform vec2 u_size;
uniform float u_opacity;
uniform float u_border; // Border size in pixels

out vec4 fragColor;

// Signed distance function for rounded rectangle
float roundedBoxSDF(vec2 center, vec2 size, float radius) {
	vec2 q = abs(center) - size + radius;
	return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

void main() {
	// v_pos is 0-1 in the quad
	// u_size is the total bounds size (video + border on each side)
	// u_border is the border width

	// Calculate position from center of the bounds
	vec2 center = (v_pos - 0.5) * u_size;

	// The video occupies the center: u_size - 2*border
	vec2 videoSize = u_size - vec2(u_border * 2.0);

	// Outer edge of the entire thing (edge of black border)
	float outerDist = roundedBoxSDF(center, u_size * 0.5, u_radius);

	// Inner edge at video boundary
	float videoDist = roundedBoxSDF(center, videoSize * 0.5, u_radius);

	// Discard anything outside the outer bounds
	if (outerDist > 0.0) {
		discard;
	}

	// Black border fills everything except outside the outer bounds
	vec3 color = vec3(0.0);
	float alpha = 1.0;

	// Simple antialiasing
	float edge = min(abs(videoDist), abs(outerDist));
	float aa = smoothstep(0.0, 1.0, edge);

	fragColor = vec4(color, alpha * aa * u_opacity);
}
