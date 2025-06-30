import "tauri-plugin-web-transport";

import { Connection } from "@kixelated/hang";
import "@kixelated/hang/support/element";

import solid from "@kixelated/signals/solid";
import { createEffect, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { Room } from "./room";
import { Status } from "./status";
import { Sup } from "./sup";

export function Hang(props: { connection: Connection }): JSX.Element {
	const canvas = (<canvas class="block bg-black w-full h-full fixed inset-0 -z-10" />) as HTMLCanvasElement;

	const room = new Room(props.connection, canvas, {
		user: localStorage.getItem("user.name") ?? undefined,
		avatar: localStorage.getItem("user.avatar") ?? undefined,
	});

	onCleanup(() => room.close());

	const user = solid(room.user);
	const avatar = solid(room.avatar);

	// Save the user name to localStorage.
	createEffect(() => {
		const n = user();
		if (n) {
			localStorage.setItem("user.name", n);
		} else {
			localStorage.removeItem("user.name");
		}
	});

	// Save the avatar to localStorage.
	createEffect(() => {
		const a = avatar();
		if (a) {
			localStorage.setItem("user.avatar", a);
		} else {
			localStorage.removeItem("user.avatar");
		}
	});

	const username = solid(room.user);
	const suspended = solid(room.suspended);

	return (
		<>
			<div>
				{canvas}
				<Show when={!username()} fallback={<Autoplay suspended={suspended()} />}>
					<Sup set={(name) => room.user.set(name)} />
				</Show>
				<Chat room={room} />
				<Controls room={room} camera={room.camera} screen={room.screen} canvas={canvas} />
			</div>
		</>
	);
}

function Autoplay(props: { suspended: boolean }): JSX.Element {
	return (
		<Show when={props.suspended}>
			<div class="absolute inset-0 bg-black/50 flex items-center justify-center">
				<div class="text-white text-2xl font-bold">Click anywhere to enable audio.</div>
			</div>
		</Show>
	);
}

const url = new URL(`${import.meta.env.VITE_RELAY_HOST}/${import.meta.env.VITE_ROOM}/`);
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
