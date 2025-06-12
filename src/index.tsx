import { Connection, Support } from "@kixelated/hang";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { Controls } from "./controls";
import { Room } from "./room";
import { Status } from "./status";
import { Chat } from "./chat";
import { Sup } from "./sup";

const RELAY = "http://localhost:4443";

export function Hang({ connection }: { connection: Connection }): JSX.Element {
	const canvas = (
		<canvas
			style={{
				display: "block",
				"background-color": "#000",
				width: "100%",
				height: "100%",
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				"z-index": -1,
			}}
		/>
	) as HTMLCanvasElement;

	const room = new Room(connection, canvas, {
		user: localStorage.getItem("user_name") ?? undefined,
	});

	onCleanup(() => room.close());

	// Save the user name to localStorage.
	createEffect(() => {
		const n = room.user.get();
		if (n) {
			localStorage.setItem("user_name", n);
		} else {
			localStorage.removeItem("user_name");
		}
	});

	return (
		<div>
			{canvas}
			<Sup user={room.user} />
			<Chat room={room} />
			<Controls room={room} camera={room.camera.source} screen={room.screen.source} canvas={canvas} />
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

const support = document.getElementById("support");
if (!support) {
	throw new Error("No support element found");
}

render(() => <Support.Modal show="partial" />, support);

const status = document.getElementById("status");
if (!status) {
	throw new Error("No status element found");
}

render(() => <Status connection={connection} />, status);
