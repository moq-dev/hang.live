import "tauri-plugin-web-transport";

import "@kixelated/hang/support/element";

import solid from "@kixelated/signals/solid";
import { Route, Router } from "@solidjs/router";
import { createEffect, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import * as Api from "@hang/api";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { Room } from "./room";

export function Hang(): JSX.Element {
	const canvas = new Canvas();
	onCleanup(() => canvas.close());

	const api = new Api.Client({
		url: new URL("http://localhost:3000"),
	});

	return (
		<Router>
			<Route path="/" component={About} />
			<Route path="/account" component={() => <Account api={api} />} />
			<Route path="/demo" component={() => <Demo canvas={canvas} api={api} />} />
		</Router>
	);
}

function Demo(props: { canvas: Canvas; api: Api.Client }): JSX.Element {
	const room = new Room(props.canvas);

	const account = new Api.Account(props.api);
	const info = solid(account.info);

	createEffect(() => {
		const i = info();
		room.user.set(i?.name);
		room.avatar.set(i?.avatar ?? Api.getDefaultAvatar());
	});

	onCleanup(() => room.close());

	const suspended = solid(room.suspended);

	return (
		<>
			<Autoplay suspended={suspended()} />
			<Chat canvas={props.canvas} room={room} />
			<Controls room={room} camera={room.camera} screen={room.screen} canvas={props.canvas} />
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
