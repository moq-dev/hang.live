//import "tauri-plugin-web-transport";
import "@kixelated/hang/support/element";
import "./tauri/update";

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
import { Canvas } from "./room/canvas";
import { Sup } from "./sup";

export function Hang(): JSX.Element {
	const background = (<canvas class="fixed inset-0 w-full h-full" />) as HTMLCanvasElement;
	const canvas = new Canvas(background);
	onCleanup(() => canvas.close());

	return (
		<>
			{background}
			<Router>
				<Route path="/" component={() => (Api.client.authenticated() ? <Home /> : <About />)} />
				<Route path="/about" component={() => <About />} />
				<Route path="/account" component={() => <Account />} />
				<Route path="/download" component={() => <Download />} />
				<Route path="/home" component={() => <Home />} />
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
