import { createSignal } from "solid-js";
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

	const left = () => (hue() - 15) % 360;
	const middle = () => hue();
	const right = () => (hue() + 15) % 360;

	return `linear-gradient(135deg, hsl(${left()}, ${SATURATION}, ${LIGHTNESS}) 0%, hsl(${middle()}, ${SATURATION}, ${LIGHTNESS}) 50%, hsl(${right()}, ${SATURATION}, ${LIGHTNESS}) 100%)`;
}
