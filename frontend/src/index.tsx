import "tauri-plugin-web-transport";

import "@kixelated/hang/support/element";

import solid from "@kixelated/signals/solid";
import { Route, Router } from "@solidjs/router";
import { Show, createEffect, onCleanup } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import { Auth } from "./auth";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { Room } from "./room";

export function Hang(): JSX.Element {
	const canvas = new Canvas();
	onCleanup(() => canvas.close());

	const auth = new Auth({
		apiUrl: "http://localhost:8080/api",
	});

	return (
		<Router>
			<Route path="/" component={About} />
			<Route path="/account" component={() => <Account auth={auth} />} />
			<Route path="/demo" component={() => <Demo canvas={canvas} auth={auth} />} />
		</Router>
	);
}

function Demo(props: { canvas: Canvas; auth: Auth }): JSX.Element {
	const user = solid(props.auth.user);

	const room = new Room(props.canvas, {
		user: user()?.name ?? "Anonymous",
		avatar: user()?.avatar_url ?? undefined,
	});

	onCleanup(() => room.close());

	const username = solid(room.user);
	const suspended = solid(room.suspended);

	// Auto-set the user from auth if not already set
	createEffect(() => {
		if (user && !username()) {
			room.user.set(user.name);
		}
	});

	return (
		<>
			<div>
				<Autoplay suspended={suspended()} />
				<Chat canvas={props.canvas} room={room} />
				<Controls room={room} camera={room.camera} screen={room.screen} canvas={props.canvas} />
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

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
