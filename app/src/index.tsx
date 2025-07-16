import "tauri-plugin-web-transport";

import "@kixelated/hang/support/element";

import * as Api from "@hang/api-client";
import { Route, Router, useParams } from "@solidjs/router";
import { onCleanup } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import { Canvas } from "./canvas";
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
				<Route
					path="/with/:name"
					component={() => <Sup canvas={canvas} api={api} room={useParams()["name"]} />}
				/>
			</Router>
		</>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
