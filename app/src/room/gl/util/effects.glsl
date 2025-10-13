// Visual effects utilities

// Chroma key removal for greenscreen
// color: the pixel color to test
// keyColor: the chroma key color to remove (typically green)
// Returns alpha: 0.0 for pixels matching key color, 1.0 for other pixels
float chromaKey(vec3 color, vec3 keyColor) {
	// Calculate distance from key color
	float dist = distance(color, keyColor);

	// Similarity threshold (0.3) and smoothness (0.05) matching ffmpeg settings
	float similarity = 0.3;
	float smoothness = 0.05;

	// Return alpha: 0.0 for green pixels, 1.0 for non-green
	return smoothstep(similarity - smoothness, similarity + smoothness, dist);
}
