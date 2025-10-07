import { Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";

export default function AudioPrompt(props: { show: boolean; onClick: () => void }): JSX.Element {
	return (
		<Show when={props.show}>
			<div class="absolute bottom-0 left-0 right-0 flex items-center justify-center z-10 m-4">
				<button
					type="button"
					onClick={props.onClick}
					class="backdrop-blur-sm rounded-2xl px-8 py-4 text-white transition-all shadow-2xl hover:scale-105 cursor-pointer"
				>
					<div class="flex items-center gap-3">
						<span class="icon-[mdi--volume-mute] w-6 h-6 text-red-500" />
						<span class="text-lg font-semibold">Click to enable audio</span>
					</div>
				</button>
			</div>
		</Show>
	);
}
