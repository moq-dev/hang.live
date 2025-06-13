import { Connection } from "@kixelated/hang";
import { createSelector } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

export function Status({ connection }: { connection: Connection }): JSX.Element {
	const status = createSelector(connection.status.get);
	const color = () => {
		if (status("connected")) return "hsl(140, 75%, 50%)";
		if (status("connecting")) return "hsl(40, 75%, 50%)";
		return "hsl(0, 75%, 50%)";
	};

	const text = () => {
		if (status("disconnected")) return "offline";
		return "live";
	};

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
