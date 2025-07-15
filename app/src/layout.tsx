import { Connection } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createMemo, JSX, Show } from "solid-js";
import { Divider } from "./divider";

export function Layout(props: { children: JSX.Element; full?: boolean; connection?: Connection }) {
	const status = props.connection ? solid(props.connection.status) : () => "connected";

	const color = createMemo(() => {
		if (status() === "connected") return "hsl(140, 75%, 50%)";
		if (status() === "connecting") return "hsl(40, 75%, 50%)";
		return "hsl(0, 75%, 50%)";
	});

	const text = createMemo(() => {
		if (status() === "disconnected") return "offline";
		return "live";
	});

	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-0" classList={{ "max-w-[900px]": !props.full }}>
			<header>
				<a href="/" class="rounded backdrop-blur-sm px-4 py-2 text-2xl">
					<span>hang</span>
					<span
						id="status"
						class="text-xs ml-1 transition-colors duration-1000 ease-in-out"
						style={{ "vertical-align": "-0.2em", color: color() }}
					>
						{text()}
					</span>
				</a>
				<div id="support" />
				<nav class="rounded backdrop-blur-sm px-4 py-2">
					<a
						href="/account"
						rel={props.full ? "noopener" : undefined}
						target={props.full ? "_blank" : undefined}
					>
						account
					</a>
				</nav>
			</header>

			<Show when={!props.full} fallback={props.children}>
				<Divider />
				<main class="flex flex-col relative">{props.children}</main>
			</Show>
		</div>
	);
}
