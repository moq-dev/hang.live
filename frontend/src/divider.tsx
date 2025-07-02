import type { JSX } from "solid-js";
import { useAnimatedGradient } from "./gradient";

export function Divider(): JSX.Element {
	const gradient = useAnimatedGradient();

	return (
		<div
			class="w-full h-1 rounded-full my-2"
			style={{
				background: gradient.horizontal(),
			}}
		/>
	);
}
