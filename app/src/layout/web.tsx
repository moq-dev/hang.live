import * as Api from "@hang/api/client";
import { JSX } from "solid-js";
import IconAccount from "~icons/mdi/account";
import IconPlay from "~icons/mdi/play";
import Divider from "../components/divider";
import Tooltip from "../components/tooltip";
import { Logo } from "./logo";

export default function Web(props: { children: JSX.Element; api?: Api.Client }) {
	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-0 max-w-[900px]">
			<header class="flex items-center justify-between mb-4">
				<Logo />
				<div id="support" />
				<nav class="rounded p-3 flex items-center gap-3">
					<OtherNav />
					<Tooltip content="Account settings" position="bottom">
						<a
							href="/account"
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<IconAccount class="w-5 h-5" />
						</a>
					</Tooltip>
				</nav>
			</header>

			<Divider />
			<main class="flex flex-col relative">{props.children}</main>
		</div>
	);
}

function OtherNav() {
	return (
		<Tooltip content="Join a hang" position="bottom">
			<a
				href="/fave"
				class="p-2 text-white hover:text-yellow-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
			>
				<IconPlay class="w-5 h-5" />
			</a>
		</Tooltip>
	);
}
