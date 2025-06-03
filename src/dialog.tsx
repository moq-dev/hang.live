import { Signal, signal } from "@kixelated/signals";
import { Show } from "solid-js";

export function Dialog(props: { name: Signal<string | undefined> }) {
	const input = signal(props.name.peek() ?? "");

	const submit = () => {
		const trimmed = input.get()?.trim();
		if (trimmed) {
			props.name.set(trimmed);
		}
	};

	return (
		<Show when={!props.name.get()}>
			<div
				style={{
					inset: "0",
					"z-index": 9999,
					background: "rgba(0, 0, 0, 0.75)",
					display: "flex",
					"align-items": "center",
					"justify-content": "center",
					position: "absolute",
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					border: "1px solid #fff",
					"border-radius": "1rem",
					"backdrop-filter": "blur(4px)",
					"min-width": "500px",
				}}
			>
				<div
					style={{
						padding: "1.5rem",
						"border-radius": "1rem",
					}}
				>
					<h2
						style={{
							"font-size": "1.5rem",
							"font-weight": "bold",
							margin: "0 0 1rem 0",
							"text-align": "center",
						}}
					>
						sup
					</h2>
					<p>Choose a name and join the hang:</p>
					<input
						type="text"
						value={input.get()}
						onInput={(e) => input.set(e.currentTarget.value)}
						placeholder="Enter your name"
						style={{
							width: "100%",
							padding: "0.5rem",
							"font-size": "1rem",
							border: "1px solid #ccc",
							"border-radius": "0.5rem",
							margin: "0 0 1rem 0",
							"box-sizing": "border-box",
						}}
					/>
					<div
						style={{
							height: input.get()?.trim() ? "3em" : "0",
							overflow: "hidden",
							transition: "height 0.3s ease-in-out",
						}}
					>
						<button
							type="button"
							onClick={submit}
							style={{
								background: "#2563eb",
								color: "white",
								border: "none",
								padding: "0.5rem 1rem",
								"font-size": "1rem",
								"border-radius": "0.5rem",
								cursor: "pointer",
							}}
						>
							Join
						</button>
					</div>
				</div>
			</div>
		</Show>
	);
}
