import { Signal } from "@kixelated/signals";
import { createEffect, createSignal, Setter, Show } from "solid-js";

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
			<div
				style={{
					"text-align": "center",
					"font-family": "Montserrat Variable, system-ui, sans-serif",
					"font-size": "1.25rem",
					"backdrop-filter": "blur(4px)",
					"border-radius": "4px",
					padding: "1rem",
					"max-width": "800px",
					margin: "0 auto",
				}}
			>
				<h1 style={{ "text-shadow": "0 0 10px rgba(0, 0, 0, 0.5)" }}>Sup</h1>

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
					style={{
						padding: "0.5rem",
						"border-radius": "4px",
						border: "1px solid rgba(0, 0, 0, 0.5)",
						"background-color": "rgba(0, 0, 0, 0.5)",
						margin: "0.5rem",
					}}
				/>

				<button
					type="button"
					onClick={() => props.user.set(name())}
					style={{
						padding: "0.5rem",
						margin: "0.5rem",
						"border-radius": "4px",
						border: "1px solid rgba(255, 255, 255, 0.5)",
						background: "transparent",
					}}
				>
					Hang
				</button>
			</div>
		</Show>
	);
}
