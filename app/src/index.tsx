import "tauri-plugin-web-transport";

import "@kixelated/hang/support/element";

import * as Api from "@hang/api/client";
import { Route, Router, useLocation } from "@solidjs/router";
import { onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import { Icons } from "./icons";
import { NotFound } from "./not-found";
import { Canvas } from "./room/canvas";
import { Start } from "./start";
import { Sup } from "./sup";

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
				<Route path="/icons" component={Icons} />
				<Route path="/start" component={() => <Start api={api} />} />
				<Route path="*" component={() => <Fallback canvas={canvas} api={api} />} />
			</Router>
		</>
	);
}

function Fallback(props: { canvas: Canvas; api: Api.Client }) {
	const path = useLocation();
	return (
		<Show when={path.pathname.startsWith("/@")} fallback={<NotFound />}>
			<Sup canvas={props.canvas} api={props.api} room={path.pathname.slice(2)} />
		</Show>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
