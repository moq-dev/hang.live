//import "tauri-plugin-web-transport";
import "@kixelated/hang/support/element";

import * as Tauri from "./tauri";

// Import update module early if on desktop to ensure it runs even if UI breaks
if (Tauri.DESKTOP) {
	import("./tauri/update");
}

import solid from "@kixelated/signals/solid";
import { Route, Router, useLocation } from "@solidjs/router";
import { onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import * as Api from "./api";
import { Download } from "./download";
import { Home } from "./home";
import { Icons } from "./icons";
import { NotFound } from "./not-found";
import { Oauth } from "./oauth";
import Privacy from "./privacy";
import { Canvas } from "./room/canvas";
import { Sup } from "./sup";

export function Hang(): JSX.Element {
	const background = (<canvas class="fixed inset-0 w-full h-full bg-black" />) as HTMLCanvasElement;
	const canvas = new Canvas(background);
	onCleanup(() => canvas.close());

	const authenticated = solid(Api.client.authenticated);

	return (
		<>
			{background}
			<Router>
				<Route path="/" component={() => (authenticated() ? <Home /> : <About />)} />
				<Route path="/about" component={() => <About />} />
				<Route path="/account" component={() => <Account />} />
				<Route path="/download" component={() => <Download />} />
				<Route path="/home" component={() => <Home />} />
				<Route path="/privacy" component={() => <Privacy />} />
				<Route path="/oauth/*redirect" component={() => <Oauth />} />
				{import.meta.env.DEV && <Route path="/dev/icons" component={Icons} />}
				<Route path="*" component={() => <Fallback background={canvas} />} />
			</Router>
		</>
	);
}

function Fallback(props: { background: Canvas }) {
	const path = useLocation();
	return (
		<Show when={path.pathname.startsWith("/@")} fallback={<NotFound />}>
			<Sup canvas={props.background} room={path.pathname.slice(2)} />
		</Show>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
