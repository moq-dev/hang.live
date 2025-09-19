import { createSignal } from "solid-js";

let offset = Math.round(Math.random() * 360);

// Shared animated hue state
const [hue, setHue] = createSignal(offset);

const updateHue = () => {
	offset = (offset + 1) % 360;
	setHue(offset);
	// Update CSS custom property for link underlines
	document.documentElement.style.setProperty("--link-hue", offset.toString());
	setTimeout(updateHue, 1000);
};

updateHue();

export default function Gradient() {
	const SATURATION = "75%";
	const LIGHTNESS = "40%";

	const left = () => (hue() - 15) % 360;
	const middle = () => hue();
	const right = () => (hue() + 15) % 360;

	return `linear-gradient(135deg, hsl(${left()}, ${SATURATION}, ${LIGHTNESS}) 0%, hsl(${middle()}, ${SATURATION}, ${LIGHTNESS}) 50%, hsl(${right()}, ${SATURATION}, ${LIGHTNESS}) 100%)`;
}
