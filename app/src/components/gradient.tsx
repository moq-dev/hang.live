import { createMemo, createSignal } from "solid-js";
import Settings from "../settings";

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

const start = createMemo(() => hue());
const second = createMemo(() => (hue() + 15) % 360);
const third = createMemo(() => (hue() + 30) % 360);
const fourth = createMemo(() => (hue() + 45) % 360);

// Only animate when potato mode is disabled
Settings.potato.watch((potato) => {
	if (!potato) {
		animate = requestAnimationFrame(updateHue);
	} else {
		cancelAnimationFrame(animate ?? 0);
	}
});

export default function Gradient() {
	const SATURATION = "75%";
	const LIGHTNESS = "40%";

	return `linear-gradient(135deg, hsl(${start()}, ${SATURATION}, ${LIGHTNESS}) 0%, hsl(${second()}, ${SATURATION}, ${LIGHTNESS}) 33%, hsl(${third()}, ${SATURATION}, ${LIGHTNESS}) 66%, hsl(${fourth()}, ${SATURATION}, ${LIGHTNESS}) 100%)`;
}
