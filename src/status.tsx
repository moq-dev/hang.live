import { Connection } from "@kixelated/hang";
import { createSelector } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

export function Status({ connection }: { connection: Connection }): JSX.Element {
	const status = createSelector(connection.status.get);
	const color = () => {
		if (status("connected")) return "#13de89";
		if (status("connecting")) return "#ffd700";
		return "#ff0000";
	};

	const text = () => {
		if (status("disconnected")) return "offline";
		return "live";
	};

	return (
		<span
			style={{
				color: color(),
				transition: "color 1.0s ease-in-out",
				"font-size": "0.5em",
				"vertical-align": "-0.2em",
			}}
		>
			{text()}
		</span>
	);
}
