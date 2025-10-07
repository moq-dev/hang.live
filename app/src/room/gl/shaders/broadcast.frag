#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_pos;

uniform sampler2D u_frameTexture;
uniform sampler2D u_avatarTexture;
uniform sampler2D u_memeTexture;
uniform bool u_avatarActive;
uniform bool u_flip; // Whether to flip the frame texture horizontally
uniform float u_radius;
uniform vec2 u_size;
uniform float u_opacity;
uniform float u_frameOpacity; // Pre-computed frame opacity (0-1)
uniform float u_memeOpacity; // Pre-computed meme opacity (0-1)
uniform vec4 u_memeBounds; // x, y, width, height in texture coordinates

out vec4 fragColor;

// Signed distance function for rounded rectangle
float roundedBoxSDF(vec2 center, vec2 size, float radius) {
	vec2 q = abs(center) - size + radius;
	return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

void main() {
	// Calculate position from center
	vec2 center = (v_pos - 0.5) * u_size;

	// Calculate SDF for rounded corners
	float dist = roundedBoxSDF(center, u_size * 0.5, u_radius);

	// Discard pixels outside the rounded rectangle
	if (dist > 0.0) {
		discard;
	}

	// Smooth edge antialiasing
	float alpha = 1.0 - smoothstep(-1.0, 0.0, dist);

	// Calculate texture coordinates (flip horizontally if needed for frame)
	vec2 frameTexCoord = u_flip ? vec2(1.0 - v_texCoord.x, v_texCoord.y) : v_texCoord;

	// Sample textures using pre-computed opacity values
	vec4 frameColor = u_frameOpacity > 0.0 ? texture(u_frameTexture, frameTexCoord) : vec4(0.0, 0.0, 0.0, 1.0);
	vec4 avatarColor = u_avatarActive && u_frameOpacity < 1.0 ? texture(u_avatarTexture, v_texCoord) : vec4(0.0, 0.0, 0.0, 1.0);
	vec4 baseColor = mix(avatarColor, frameColor, u_frameOpacity);

	if (u_memeOpacity > 0.0) {
		// Calculate the meme texture coordinates based on memeBounds
		// memeBounds contains the x, y offset and width, height scaling
		vec2 memeTexCoord = (v_texCoord - u_memeBounds.xy) / u_memeBounds.zw;

		// Only sample if we're within the meme bounds
		if (memeTexCoord.x >= 0.0 && memeTexCoord.x <= 1.0 &&
			memeTexCoord.y >= 0.0 && memeTexCoord.y <= 1.0) {
			vec4 memeColor = texture(u_memeTexture, memeTexCoord);

			// Blend meme on top using alpha compositing
			// The meme uses WebM+VP9 with alpha channel for transparency
			float memeAlpha = memeColor.a * u_memeOpacity;
			baseColor.rgb = mix(baseColor.rgb, memeColor.rgb, memeAlpha);
			baseColor.a = max(baseColor.a, memeAlpha);
		}
	}

	fragColor = vec4(baseColor.rgb, baseColor.a * alpha * u_opacity);
}
