#version 300 es

in vec2 a_position;

uniform mat4 u_projection;
uniform vec4 u_bounds; // x, y, width, height
uniform float u_depth;

out vec2 v_pos; // Position within the quad (0-1)

void main() {
	// Scale and translate to bounds
	vec2 pos = a_position * u_bounds.zw + u_bounds.xy;

	// Apply projection
	gl_Position = u_projection * vec4(pos, u_depth, 1.0);

	v_pos = a_position;
}
