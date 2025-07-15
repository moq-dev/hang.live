import "tauri-plugin-web-transport";

import "@kixelated/hang/support/element";

import * as Api from "@hang/api-client";
import solid from "@kixelated/signals/solid";
import { Route, Router } from "@solidjs/router";
import { onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { Layout } from "./layout";
import { Room } from "./room";

export function Hang(): JSX.Element {
	const background = (<canvas class="fixed inset-0 w-full h-full" />) as HTMLCanvasElement;
	const canvas = new Canvas(background);
	onCleanup(() => canvas.close());

	const api = new Api.Client(new URL(import.meta.env.VITE_API_URL));

	return (
		<>
			{background}
			<Router>
				<Route path="/" component={About} />
				<Route path="/account" component={() => <Account api={api} />} />
				<Route path="/demo" component={() => <Demo canvas={canvas} api={api} />} />
			</Router>
		</>
	);
}

function Demo(props: { canvas: Canvas; api: Api.Client }): JSX.Element {
	const room = new Room(props.canvas);
	onCleanup(() => room.close());

	if (props.api.authenticated()) {
		props.api.routes.account.info
			.$get()
			.then(async (info) => {
				if (!info.ok) throw new Error(info.statusText);
				return await info.json();
			})
			.then((info) => {
				room.user.set(info.name);
				room.avatar.set(info.avatar);
			});
	}

	const suspended = solid(room.suspended);

	return (
		<Layout full={true}>
			<Autoplay suspended={suspended()} />
			<Chat canvas={props.canvas} room={room} />
			<Controls room={room} camera={room.camera} screen={room.screen} canvas={props.canvas} />
		</Layout>
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
