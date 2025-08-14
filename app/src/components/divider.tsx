import type { JSX } from "solid-js";
import Gradient from "./gradient";

export default function Divider(): JSX.Element {
	return (
		/* Make a thick black outline around the gradient. */
		<div
			class="w-full h-1 rounded-full my-2"
			style={{
				background: Gradient(),
			}}
		/>
	);
}
