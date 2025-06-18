import { Connection } from "@kixelated/hang";
import { createMemo } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import solid from "@kixelated/signals/solid";

export function Status(props: { connection: Connection }): JSX.Element {
	const status = solid(props.connection.status);

	//const [status, setStatus] = createSignal<ConnectionStatus>("disconnected");
	//props.connection.status.subscribe((status) => setStatus(status));

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
