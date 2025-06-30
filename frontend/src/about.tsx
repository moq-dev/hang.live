import { createMemo, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Background } from "./background";

const background = document.getElementById("bg");
if (!background) {
	throw new Error("No background element found");
}

render(() => <Background />, background);

const divider = document.getElementById("divider");
if (!divider) {
	throw new Error("No divider element found");
}

const offset = Math.round(Math.random() * 360);
const SPEED = 4;

const [hue, setHue] = createSignal(offset);
const animate = () => {
	const color = Math.round((offset + performance.now() / 1000) * SPEED) % 360;
	setHue(color);
	document.documentElement.style.setProperty("--link-hue", color.toString());
	requestAnimationFrame(animate);
};

requestAnimationFrame(animate);

render(() => {
	const start = createMemo(() => hue());
	const middle = createMemo(() => (hue() + 25) % 360);
	const end = createMemo(() => (hue() + 50) % 360);

	return (
		<div
			class="w-full h-1 rounded-full"
			style={{
				// TODO: A linear-gradient is incorrect. We really want something like hue-rotate.
				background: `linear-gradient(to right, hsl(${start()}, 75%, 50%), hsl(${middle()}, 75%, 50%), hsl(${end()}, 75%, 50%))`,
			}}
		/>
	);
}, divider);
