import { Connection } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createMemo } from "solid-js";

export function Logo(props: { connection?: Connection }) {
	const status = props.connection ? solid(props.connection.status) : () => "connected";

	const color = createMemo(() => {
		if (status() === "connected") return "hsl(140, 75%, 50%)";
		if (status() === "connecting") return "hsl(40, 75%, 50%)";
		return "hsl(0, 75%, 50%)";
	});

	const text = createMemo(() => {
		if (status() === "disconnected") return "offline";
		return "live";
	});

	return (
		<a href="/" class="rounded backdrop-blur-sm px-4 py-2 text-2xl">
			<span>hang</span>
			<span
				id="status"
				class="text-xs ml-1 transition-colors duration-1000 ease-in-out"
				style={{ "vertical-align": "-0.2em", color: color() }}
			>
				{text()}
			</span>
		</a>
	);
}
