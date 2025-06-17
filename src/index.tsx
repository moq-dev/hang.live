import { Connection, Support } from "@kixelated/hang";
import { createEffect, onCleanup } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { Room } from "./room";
import { Status } from "./status";
import { Sup } from "./sup";

export function Hang(props: { connection: Connection }): JSX.Element {
	const canvas = (<canvas class="block bg-black w-full h-full fixed inset-0 -z-10" />) as HTMLCanvasElement;

	// eslint-disable-next-line solid/reactivity
	const room = new Room(props.connection, canvas, {
		user: localStorage.getItem("user.name") ?? undefined,
		avatar: localStorage.getItem("user.avatar") ?? undefined,
	});

	onCleanup(() => room.close());

	// Save the user name to localStorage.
	createEffect(() => {
		const n = room.user.get();
		if (n) {
			localStorage.setItem("user.name", n);
		} else {
			localStorage.removeItem("user.name");
		}
	});

	// Save the avatar to localStorage.
	createEffect(() => {
		const a = room.avatar.get();
		if (a) {
			localStorage.setItem("user.avatar", a);
		} else {
			localStorage.removeItem("user.avatar");
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

const url = new URL(`${import.meta.env.VITE_RELAY_HOST}/hang/`);
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
