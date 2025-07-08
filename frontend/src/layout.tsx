import { JSX, Show } from "solid-js";
import { Divider } from "./divider";

export function Layout(props: { children: JSX.Element; full?: boolean }) {
	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-0" classList={{ "max-w-[900px]": !props.full }}>
			<header>
				<a href="/" class="logo">
					<span>hang</span>
					<span id="status">live</span>
				</a>
				<div id="support"></div>
				<nav>
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
