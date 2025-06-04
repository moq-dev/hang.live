import { Connection } from "@kixelated/hang";
import { onCleanup } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { Controls } from "./controls";
import { Room } from "./room";
import { Status } from "./status";

const RELAY = "http://localhost:4443";

export function Hang({ connection }: { connection: Connection }): JSX.Element {
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

	// Generate a random user ID if none is set.
	// Obviously this should be replaced with a proper auth system.
	let user = localStorage.getItem("user_id");
	if (!user) {
		const rand = new Uint32Array(1);
		window.crypto.getRandomValues(rand);
		user = rand[0].toString();
		localStorage.setItem("user_id", user);
	}

	console.log(user);

	const room = new Room(connection, canvas, { user });
	onCleanup(() => room.close());

	return (
		<div>
			{canvas}
			<Controls room={room} camera={room.camera} screen={room.screen} />
		</div>
	);
}

const url = new URL(`${RELAY}/demo/`);
const connection = new Connection({ url });

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang connection={connection} />, hang);

const status = document.getElementById("status");
if (!status) {
	throw new Error("No status element found");
}

render(() => <Status connection={connection} />, status);
