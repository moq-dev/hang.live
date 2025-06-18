import { Signal } from "@kixelated/signals";
import solid from "@kixelated/signals/solid";
import { Show, createEffect, createSignal } from "solid-js";
import IconArrowRight from "~icons/mdi/arrow-right-box";

// Ask the user for their user name.
// Obviously this should be replaced with a proper auth system.
export function Sup(props: { user: Signal<string | undefined> }) {
	const [name, setName] = createSignal(localStorage.getItem("user_name") ?? "");

	const user = solid(props.user);

	// Save the user name to localStorage.
	createEffect(() => {
		const n = user();
		if (n) {
			localStorage.setItem("user_name", n);
		} else {
			localStorage.removeItem("user_name");
		}
	});

	return (
		<Show when={!user()}>
			<main class="text-center wrapper">
				<h1 class="text-shadow-lg text-4xl font-bold">Sup</h1>

				<p>This is an early #alpha build of Hang.</p>
				<p>
					There's a ton of things left to implement, so please don't share this secret link with anyone
					without asking pretty please. Chrome is the only tested browser, Firefox should work in theory, and
					Safari is a dumpster fire.
				</p>
				<p>Until accounts are implemented, choose a super unique username:</p>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						props.user.set(name());
					}}
				>
					<input
						type="text"
						placeholder="Choose a name"
						value={name()}
						onInput={(e) => setName(e.target.value)}
						class="p-2 rounded border border-black/50 bg-black/50 m-2"
					/>

					<button
						type="submit"
						class="p-2 m-2 rounded border-transparent bg-transparent cursor-pointer transition-colors text-lg"
						classList={{
							"text-green-500": name().length > 0,
						}}
					>
						<IconArrowRight />
					</button>
				</form>
			</main>
		</Show>
	);
}
