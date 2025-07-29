import { createMemo, createSignal } from "solid-js";
import Settings from "./room/settings";

const offset = Math.round(Math.random() * 360);
const SPEED = 1;

// Shared animated hue state
const [hue, setHue] = createSignal(offset);
let animate: number | null = null;

const updateHue = () => {
	const color = Math.round((offset + performance.now() / 1000) * SPEED) % 360;
	setHue(color);
	// Update CSS custom property for link underlines
	document.documentElement.style.setProperty("--link-hue", color.toString());
	animate = requestAnimationFrame(updateHue);
};

// Only animate when potato mode is disabled
Settings.potato.watch((potato) => {
	if (!potato) {
		animate = requestAnimationFrame(updateHue);
	} else {
		cancelAnimationFrame(animate ?? 0);
	}
});

export function useAnimatedGradient() {
	const start = createMemo(() => hue());
	const second = createMemo(() => (hue() + 15) % 360);
	const third = createMemo(() => (hue() + 30) % 360);
	const fourth = createMemo(() => (hue() + 45) % 360);

	const SATURATION = "75%";
	const LIGHTNESS = "40%";

	return {
		// Linear gradients - small hue range
		linear: createMemo(
			() =>
				`linear-gradient(135deg, hsl(${start()}, ${SATURATION}, ${LIGHTNESS}) 0%, hsl(${second()}, ${SATURATION}, ${LIGHTNESS}) 33%, hsl(${third()}, ${SATURATION}, ${LIGHTNESS}) 66%, hsl(${fourth()}, ${SATURATION}, ${LIGHTNESS}) 100%)`,
		),

		// Radial gradient - small hue range
		radial: createMemo(
			() =>
				`radial-gradient(circle, hsl(${start()}, ${SATURATION}, ${LIGHTNESS}) 0%, hsl(${second()}, ${SATURATION}, ${LIGHTNESS}) 33%, hsl(${third()}, ${SATURATION}, ${LIGHTNESS}) 66%, hsl(${fourth()}, ${SATURATION}, ${LIGHTNESS}) 100%)`,
		),

		// Simple horizontal (for divider compatibility) - even smaller range
		horizontal: createMemo(() => {
			const middle = (hue() + 10) % 360;
			const end = (hue() + 20) % 360;
			return `linear-gradient(to right, hsl(${start()}, ${SATURATION}, ${LIGHTNESS}), hsl(${middle}, ${SATURATION}, ${LIGHTNESS}), hsl(${end}, ${SATURATION}, ${LIGHTNESS}))`;
		}),

		// Individual hue values for custom use
		hues: {
			start: createMemo(() => start()),
			second: createMemo(() => second()),
			third: createMemo(() => third()),
			fourth: createMemo(() => fourth()),
		},
	};
}
