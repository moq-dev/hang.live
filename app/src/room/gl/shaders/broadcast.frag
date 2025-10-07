#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_pos;

uniform sampler2D u_frameTexture;
uniform sampler2D u_avatarTexture;
uniform sampler2D u_memeTexture;
uniform bool u_frameActive;
uniform bool u_memeActive;
uniform bool u_avatarActive;
uniform float u_radius;
uniform vec2 u_size;
uniform float u_opacity;
uniform float u_frameTransition; // start time of avatar transition in milliseconds
uniform float u_now;
uniform float u_memeTransition; // start time of meme in milliseconds
uniform vec4 u_memeBounds; // x, y, width, height in texture coordinates

out vec4 fragColor;

// Signed distance function for rounded rectangle
float roundedBoxSDF(vec2 center, vec2 size, float radius) {
	vec2 q = abs(center) - size + radius;
	return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

void main() {
	const float TRANSITION_DURATION = 300.0; // 300ms transition

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

	float frameElapsed = u_now - u_frameTransition;
	float frameOpacity = 0.0;

	if (u_frameActive) {
		frameOpacity = clamp(frameElapsed / TRANSITION_DURATION, 0.0, 1.0);
	} else {
		frameOpacity = 1.0 - clamp(frameElapsed / TRANSITION_DURATION, 0.0, 1.0);
	}

	// Sample textures
	vec4 frameColor = frameOpacity > 0.0 ? texture(u_frameTexture, v_texCoord) : vec4(0.0, 0.0, 0.0, 1.0);
	vec4 avatarColor = u_avatarActive && frameOpacity < 1.0 ? texture(u_avatarTexture, v_texCoord) : vec4(0.0, 0.0, 0.0, 1.0);
	vec4 baseColor = mix(avatarColor, frameColor, frameOpacity);

	// Compute meme opacity based on time and transition direction
	float memeElapsed = u_now - u_memeTransition;
	float memeOpacity = 0.0;

	// Fade in
	if (u_memeActive) {
		memeOpacity = clamp(memeElapsed / TRANSITION_DURATION, 0.0, 1.0);
	} else {
		// Fade out
		memeOpacity = 1.0 - clamp(memeElapsed / TRANSITION_DURATION, 0.0, 1.0);
	}

	if (memeOpacity > 0.0) {
		// Calculate the meme texture coordinates based on memeBounds
		// memeBounds contains the x, y offset and width, height scaling
		vec2 memeTexCoord = (v_texCoord - u_memeBounds.xy) / u_memeBounds.zw;

		// Only sample if we're within the meme bounds
		if (memeTexCoord.x >= 0.0 && memeTexCoord.x <= 1.0 &&
			memeTexCoord.y >= 0.0 && memeTexCoord.y <= 1.0) {
			vec4 memeColor = texture(u_memeTexture, memeTexCoord);

			// Blend meme on top using alpha compositing
			// The meme uses WebM+VP9 with alpha channel for transparency
			float memeAlpha = memeColor.a * memeOpacity;
			baseColor.rgb = mix(baseColor.rgb, memeColor.rgb, memeAlpha);
			baseColor.a = max(baseColor.a, memeAlpha);
		}
	}

	fragColor = vec4(baseColor.rgb, baseColor.a * alpha * u_opacity);
}
