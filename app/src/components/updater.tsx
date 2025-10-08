import { createSignal, onMount, Show } from "solid-js";
import * as Tauri from "../tauri/constants";
import Tooltip from "./tooltip";

const module = Tauri.DESKTOP ? await import("../tauri/update") : undefined;

type Status =
	| {
			type: "available";
			version: string;
	  }
	| {
			type: "downloading";
			version: string;
			size?: number;
			progress: number;
	  }
	| {
			type: "downloaded";
			version: string;
			size: number;
	  }
	| {
			type: "installing";
			version: string;
	  }
	| {
			type: "error";
			error: string;
	  };

export default function UpdaterIcon() {
	const [status, setStatus] = createSignal<Status | undefined>();

	onMount(async () => {
		// Import the update module
		const updater = (await module)?.update;
		if (!updater) return;

		// Subscribe to status changes
		const dispose = updater.status.subscribe((newStatus) => {
			setStatus(newStatus);
		});

		return () => dispose();
	});

	const handleClick = async () => {
		const s = status();
		if (!s) return;

		const module = await import("../tauri/update");

		if (s.type === "available") {
			module.update.download();
		} else if (s.type === "downloaded") {
			module.update.install();
		}
	};

	const tooltipContent = () => {
		const s = status();
		if (!s) return "";

		if (s.type === "error") return `Error: ${s.error}`;
		if (s.type === "available") return `Update ${s.version} available`;
		if (s.type === "downloading") return `Downloading ${s.version}...`;
		if (s.type === "downloaded") return `Install ${s.version} now`;
		if (s.type === "installing") return `Installing ${s.version}...`;
		return "";
	};

	const progressPercent = () => {
		const s = status();
		if (!s || s.type !== "downloading" || !s.size) return 0;
		return (s.progress / s.size) * 100;
	};

	return (
		<Show when={status()}>
			<Tooltip content={tooltipContent()} position="bottom">
				<button
					type="button"
					onClick={handleClick}
					class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer relative"
					classList={{
						"text-red-500": status()?.type === "error",
						"text-blue-500": status()?.type === "available" || status()?.type === "downloading",
						"text-green-500": status()?.type === "downloaded",
						"text-yellow-500": status()?.type === "installing",
					}}
				>
					<Show when={status()?.type === "error"}>
						<span class="icon-[mdi--alert-circle]" />
					</Show>
					<Show when={status()?.type === "available"}>
						<span class="icon-[mdi--download]" />
					</Show>
					<Show when={status()?.type === "downloading"}>
						<svg class="w-6 h-6" viewBox="0 0 24 24" aria-label="Downloading update">
							<title>Downloading update</title>
							<circle
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="2"
								fill="none"
								opacity="0.2"
							/>
							<circle
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="2"
								fill="none"
								stroke-dasharray={`${2 * Math.PI * 10}`}
								stroke-dashoffset={`${2 * Math.PI * 10 * (1 - progressPercent() / 100)}`}
								stroke-linecap="round"
								transform="rotate(-90 12 12)"
							/>
							<path
								fill="currentColor"
								d="M12 6v8l4 2"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</Show>
					<Show when={status()?.type === "downloaded"}>
						<span class="icon-[mdi--download-circle]" />
					</Show>
					<Show when={status()?.type === "installing"}>
						<span class="icon-[mdi--loading] animate-spin" />
					</Show>
				</button>
			</Tooltip>
		</Show>
	);
}
