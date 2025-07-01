import type { JSX } from "solid-js";
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";

const offset = Math.round(Math.random() * 360);
const SPEED = 4;

export function Divider(): JSX.Element {
	let animate: number | null = null;

	const [hue, setHue] = createSignal(offset);
	const updateHue = () => {
		const color = Math.round((offset + performance.now() / 1000) * SPEED) % 360;
		setHue(color);
		document.documentElement.style.setProperty("--link-hue", color.toString());
		animate = requestAnimationFrame(updateHue);
	};

	onMount(() => {
		animate = requestAnimationFrame(updateHue);
	});

	onCleanup(() => {
		if (animate) {
			window.cancelAnimationFrame(animate);
		}
	});

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
}
