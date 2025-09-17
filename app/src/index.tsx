//import "tauri-plugin-web-transport";
import "@kixelated/hang/support/element";
import "./tauri/update";

import * as Api from "@hang/api/client";
import { Route, Router, useLocation } from "@solidjs/router";
import { onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import { Download } from "./download";
import { Home } from "./home";
import { Icons } from "./icons";
import { NotFound } from "./not-found";
import { Canvas } from "./room/canvas";
import { Sup } from "./sup";

export function Hang(): JSX.Element {
	const background = (<canvas class="fixed inset-0 w-full h-full" />) as HTMLCanvasElement;
	const canvas = new Canvas(background);
	onCleanup(() => canvas.close());

	let url = import.meta.env.VITE_API_URL;
	console.log(import.meta.env.TAURI_ENV_DEBUG, import.meta.env.TAURI_ENV_PLATFORM, url);
	if (import.meta.env.TAURI_ENV_DEBUG && import.meta.env.TAURI_ENV_PLATFORM === "android") {
		// Android emulators use 10.0.2.2 as the localhost address.
		url = url.replace("localhost", "10.0.2.2");
	}

	const api = new Api.Client(new URL(url));

	return (
		<>
			{background}
			<Router>
				<Route path="/" component={() => (api.authenticated() ? <Home api={api} /> : <About />)} />
				<Route path="/about" component={() => <About />} />
				<Route path="/account" component={() => <Account api={api} />} />
				<Route path="/download" component={() => <Download />} />
				<Route path="/home" component={() => <Home api={api} />} />
				{import.meta.env.DEV && <Route path="/dev/icons" component={Icons} />}
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
