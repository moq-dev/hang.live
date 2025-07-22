import { Connection } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createMemo, JSX, Show } from "solid-js";
import IconAccount from "~icons/mdi/account";
import IconShare from "~icons/mdi/share-variant";
import { Divider } from "./divider";
import { Tooltip } from "./tooltip";

export function Layout(props: { children: JSX.Element; app?: boolean; connection?: Connection }) {
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

	const shareRoom = async () => {
		const url = window.location.href;

		if (navigator.share) {
			try {
				await navigator.share({
					title: "Join my Hang room",
					text: "Come hang out with us!",
					url: url,
				});
			} catch (err) {
				console.log("Share cancelled or failed:", err);
			}
		} else {
			try {
				await navigator.clipboard.writeText(url);
				console.log("Room URL copied to clipboard");
			} catch (err) {
				console.error("Failed to copy URL:", err);
			}
		}
	};

	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-0" classList={{ "max-w-[900px]": !props.app }}>
			<header class="flex items-center justify-between mb-4">
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
				<nav class="rounded p-3 flex items-center gap-3">
					<Tooltip content="Share room link" position="bottom">
						<button
							type="button"
							onClick={shareRoom}
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<IconShare class="w-5 h-5" />
						</button>
					</Tooltip>
					<Tooltip content="Account settings" position="bottom">
						<a
							href="/account"
							rel={props.app ? "noopener" : undefined}
							target={props.app ? "_blank" : undefined}
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<IconAccount class="w-5 h-5" />
						</a>
					</Tooltip>
				</nav>
			</header>

			<Show when={!props.app} fallback={props.children}>
				<Divider />
				<main class="flex flex-col relative">{props.children}</main>
			</Show>
		</div>
	);
}
