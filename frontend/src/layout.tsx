import { JSX, Show } from "solid-js";
import { Divider } from "./divider";

export function Layout(props: { children: JSX.Element; full?: boolean }) {
	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-0" classList={{ "max-w-[900px]": !props.full }}>
			<header>
				<a href="/" class="rounded backdrop-blur-sm px-4 py-2 text-2xl">
					<span>hang</span>
					<span
						id="status"
						class="text-xs ml-1"
						style={{ "vertical-align": "-0.2em", color: "hsl(140, 75%, 50%)" }}
					>
						live
					</span>
				</a>
				<div id="support" />
				<nav class="rounded backdrop-blur-sm px-4 py-2">
					<a href="/account">account</a>
				</nav>
			</header>

			<Show when={!props.full} fallback={props.children}>
				<Divider />
				<main class="flex flex-col relative">{props.children}</main>
			</Show>
		</div>
	);
}
