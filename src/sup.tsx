import { createSignal } from "solid-js";
import IconArrowRight from "~icons/mdi/arrow-right-box";

// Ask the user for their user name.
// Obviously this should be replaced with a proper auth system.
export function Sup(props: { set: (name: string) => void }) {
	const [input, setInput] = createSignal("");

	return (
		<main class="text-center wrapper">
			<h1 class="text-shadow-lg text-4xl font-bold">Sup</h1>

			<p>This is an early #alpha build of Hang.</p>
			<p>
				There's a ton of things left to implement, so please don't share this secret link with anyone without
				asking pretty please. Chrome is the only tested browser, Firefox should work in theory, and Safari is a
				dumpster fire.
			</p>
			<p>Until accounts are implemented, choose a super unique username:</p>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					props.set(input());
				}}
			>
				<input
					type="text"
					placeholder="Choose a name"
					value={input()}
					onInput={(e) => setInput(e.target.value)}
					class="p-2 rounded border border-black/50 bg-black/50 m-2"
				/>

				<button
					type="submit"
					class="p-2 m-2 rounded border-transparent bg-transparent cursor-pointer transition-colors text-lg"
					classList={{
						"text-green-500": input().length > 0,
					}}
				>
					<IconArrowRight />
				</button>
			</form>
		</main>
	);
}
