import { Route, Router, type RouteSectionProps, useCurrentMatches, useLocation } from "@solidjs/router";
import { onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Account } from "./account";
import * as Api from "./api";
import { Home } from "./home";
import { NotFound } from "./not-found";
import { Oauth } from "./oauth";
import Privacy from "./privacy";
import { Canvas } from "./room/canvas";
import { Sup } from "./sup";
import { solid } from "./util/solid";

function Hang(): JSX.Element {
	const background = (<canvas class="fixed inset-0 w-full h-full bg-black" />) as HTMLCanvasElement;

	const canvas = new Canvas(background);
	onCleanup(() => canvas.close());

	const authenticated = solid(Api.client.authenticated);

	return (
		<>
			{background}
			<Router root={Root}>
				<Route path="/" component={() => (authenticated() ? <Home /> : <About />)} />
				<Route path="/about" component={() => <About />} />
				<Route path="/account" component={() => <Account />} />
				<Route path="/home" component={() => <Home />} />
				<Route path="/privacy" component={() => <Privacy />} />
				<Route path="/oauth/*redirect" component={() => <Oauth />} />
				<Route path="*" component={() => <Fallback canvas={canvas} />} />
			</Router>
		</>
	);
}

// The router matches no route at all, not even `*`, when the path has an empty segment like `/a//b`.
function Root(props: RouteSectionProps): JSX.Element {
	const matches = useCurrentMatches();
	return (
		<Show when={matches().length > 0} fallback={<NotFound />}>
			{props.children}
		</Show>
	);
}

function Fallback(props: { canvas: Canvas }) {
	const path = useLocation();
	return (
		<Show when={path.pathname.startsWith("/@")} fallback={<NotFound />}>
			<Sup canvas={props.canvas} room={path.pathname.slice(2)} />
		</Show>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
