import { Connection } from "@kixelated/hang";
import { createMemo, createSelector, onCleanup } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

export function Status(props: { connection: Connection }): JSX.Element {
	const status = createSelector(() => props.connection.status.get());

	onCleanup(() => {
		console.log("cleanup");
	});

	const color = createMemo(() => {
		console.log("current status", props.connection.status.get());
		onCleanup(() => {
			console.log("cleanup memo");
		});
		if (status("connected")) return "hsl(140, 75%, 50%)";
		if (status("connecting")) return "hsl(40, 75%, 50%)";
		return "hsl(0, 75%, 50%)";
	});

	const text = createMemo(() => {
		if (status("disconnected")) return "offline";
		return "live";
	});

	return (
		<span
			class="transition-colors duration-1000 ease-in-out"
			style={{
				color: color(),
			}}
		>
			{text()}
		</span>
	);
}
