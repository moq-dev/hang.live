import { render } from "solid-js/web";
import { Background } from "./background";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";

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

const [now, setNow] = createSignal(offset);
let cancel: number;
const animate = () => {
	setNow(offset + performance.now() / 1000);
	cancel = requestAnimationFrame(animate);
};

cancel = requestAnimationFrame(animate);
//onCleanup(() => {
// cancelAnimationFrame(cancel);
//});

render(() => {
	const start = createMemo(() => Math.round(now() * SPEED) % 360);
	const middle = createMemo(() => Math.round(now() * SPEED + 25) % 360);
	const end = createMemo(() => Math.round(now() * SPEED + 50) % 360);

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

const updateHue = () => {
	const hue = Math.round(now() * SPEED + 25) % 360;
	document.documentElement.style.setProperty("--link-hue", hue.toString());
	requestAnimationFrame(updateHue);
};
updateHue();
