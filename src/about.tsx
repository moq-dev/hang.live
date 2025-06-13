import { render } from "solid-js/web";
import { Background } from "./background";
import { createMemo, createSignal, onCleanup } from "solid-js";

const background = document.getElementById("bg");
if (!background) {
	throw new Error("No background element found");
}

render(() => <Background />, background);

const divider = document.getElementById("divider");
if (!divider) {
	throw new Error("No divider element found");
}

render(() => {
	const SPEED = 4;
	const offset = Math.round(Math.random() * 360);

	const [now, setNow] = createSignal(0);
	const start = createMemo(() => (Math.round(now() * SPEED) + offset) % 360);
	const end = createMemo(() => (Math.round((now() + 50) * SPEED) + offset) % 360);

	let cancel: number;
	const animate = () => {
		setNow(performance.now() / 1000);
		cancel = requestAnimationFrame(animate);
	};

	cancel = requestAnimationFrame(animate);
	onCleanup(() => {
		cancelAnimationFrame(cancel);
	});

	return (
		<div
			class="w-full h-1 rounded-full"
			style={{
				background: `linear-gradient(to right, hsl(${start()}, 75%, 50%), hsl(${end()}, 75%, 50%))`,
			}}
		/>
	);
}, divider);
