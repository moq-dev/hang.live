import { Connection, Support } from "@kixelated/hang";
import { Room } from "./room";
import { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { onCleanup } from "solid-js";
import { Controls } from "./controls";
import { Dialog } from "./dialog";

const RELAY = "http://localhost:4443";

export function Hang(): JSX.Element {
	const canvas = (
		<canvas
			style={{
				display: "block",
				"background-color": "#000",
				width: "100%",
				height: "100%",
			}}
		/>
	) as HTMLCanvasElement;

	const url = new URL(`${RELAY}/demo/`);
	const connection = new Connection({ url });

	const room = new Room(connection, canvas);
	onCleanup(() => room.close());

	return (
		<div>
			{canvas}
			<Dialog name={room.name} />
			<Controls room={room} camera={room.camera} screen={room.screen} />
		</div>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);

const support = document.getElementById("support");
if (!support) {
	throw new Error("No support element found");
}

render(() => <Support.Modal show="partial" />, support);
