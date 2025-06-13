import { Signal } from "@kixelated/signals";
import { createEffect, createSignal, Show } from "solid-js";

// Ask the user for their user name.
// Obviously this should be replaced with a proper auth system.
export function Sup(props: { user: Signal<string | undefined> }) {
	const [name, setName] = createSignal(localStorage.getItem("user_name") ?? "");

	// Save the user name to localStorage.
	createEffect(() => {
		const n = props.user.get();
		if (n) {
			localStorage.setItem("user_name", n);
		} else {
			localStorage.removeItem("user_name");
		}
	});

	return (
		<Show when={!props.user.get()}>
			<main class="text-center">
				<h1 class="text-shadow-lg text-2xl">Sup</h1>

				<p>This is an early #alpha build of Hang.</p>
				<p>
					There's a ton of things left to implement, so please don't share this with anyone without asking
					pretty please.
				</p>
				<p>Until accounts are implemented, choose a super unique username:</p>

				<input
					type="text"
					placeholder="Choose a name"
					value={name()}
					onInput={(e) => setName(e.target.value)}
					class="p-2 rounded border border-black/50 bg-black/50 m-2"
				/>

				<button
					type="button"
					onClick={() => props.user.set(name())}
					class="p-2 m-2 rounded border border-white/50 bg-transparent"
				>
					Hang
				</button>
			</main>
		</Show>
	);
}
