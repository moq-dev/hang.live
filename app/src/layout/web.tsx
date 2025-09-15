import { type JSX, Show } from "solid-js";
import Divider from "../components/divider";
import Tooltip from "../components/tooltip";
import Tauri from "../tauri/api";
import { Logo } from "./logo";

export default function Web(props: { children: JSX.Element }) {
	return (
		<div class="p-4 mx-auto w-full flex flex-col max-w-[1150px]">
			<header class="flex items-center justify-between leading-none text-xl">
				<Logo />
				<div id="support" />
				<nav class="rounded p-3 flex items-center gap-3">
					<Show when={!Tauri}>
						<Tooltip content="Download app" position="bottom">
							<a
								href="/download"
								class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
							>
								<span class="icon-[mdi--download]" />
							</a>
						</Tooltip>
					</Show>
					<Tooltip content="Account settings" position="bottom">
						<a
							href="/account"
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<span class="icon-[mdi--account]" />
						</a>
					</Tooltip>
				</nav>
			</header>

			<Divider />

			<main class="flex flex-col relative p-4 sm:p-8 w-full bg-black text-white rounded-lg">
				{props.children}
			</main>

			<footer class="flex justify-center items-center gap-4 mt-4 sm:mt-8 leading-none text-xl text-center text-gray-500">
				<Tooltip content="Join Discord" position="top">
					<a
						href="https://discord.gg/SRG9gu6BdE"
						target="_blank"
						rel="noopener noreferrer"
						class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
					>
						<span class="icon-[mdi--discord]" />
					</a>
				</Tooltip>
				<Tooltip content="Open Source" position="top">
					<a
						href="https://moq.dev"
						target="_blank"
						rel="noopener noreferrer"
						class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
					>
						<span class="icon-[mdi--github]" />
					</a>
				</Tooltip>
				<Tooltip content="Contact us" position="top">
					<a
						href="mailto:admin@hang.live"
						class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
					>
						<span class="icon-[mdi--email]" />
					</a>
				</Tooltip>
			</footer>
		</div>
	);
}
