import { Signal, signal } from "@kixelated/signals";
import { Show } from "solid-js";

export function Dialog(props: { name: Signal<string | undefined> }) {
	const input = signal("");

	const submit = () => {
		const trimmed = input.get()?.trim();
		if (trimmed) {
			props.name.set(trimmed);
		}
	};

	return (
		<Show when={!props.name.get()}>
			<div class="inset-0 z-[9999] bg-black/75 flex items-center justify-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-white rounded-2xl backdrop-blur-sm min-w-[500px]">
				<div class="p-6 rounded-2xl">
					<h2 class="text-2xl font-bold m-0 mb-4 text-center">sup</h2>
					<p>Choose a name and join the hang:</p>
					<input
						type="text"
						value={input.get()}
						onInput={(e) => input.set(e.currentTarget.value)}
						placeholder="Enter your name"
						class="w-full p-2 text-base border border-gray-300 rounded-lg mb-4 box-border"
					/>
					<div
						class={`h-${input.get()?.trim() ? "12" : "0"} overflow-hidden transition-[height] duration-300 ease-in-out`}
					>
						<button
							type="button"
							onClick={submit}
							class="bg-blue-600 text-white border-none p-2 px-4 text-base rounded-lg cursor-pointer"
						>
							Join
						</button>
					</div>
				</div>
			</div>
		</Show>
	);
}
