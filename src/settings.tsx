import { signal, Signals } from "@kixelated/signals";
import { JSX } from "solid-js/jsx-runtime";

const Settings = {
	draggable: signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: signal(localStorage.getItem("settings.volume") ?? "100"),
};

const signals = new Signals();

signals.effect(() => {
	localStorage.setItem("settings.draggable", Settings.draggable.get().toString());
});

signals.effect(() => {
	localStorage.setItem("settings.volume", Settings.volume.get().toString());
});

// Mostly just to avoid console warnings about signals not being closed
document.addEventListener("unload", () => {
	signals.close();
});

export default Settings;

export function Modal(): JSX.Element {
	return (
		<>
			<div
				style={{ display: "flex", "align-items": "center", gap: "8px" }}
				title="If we allow other users to move our window. If disabled, then only we can move ourselves by clicking and dragging."
			>
				<input
					type="checkbox"
					checked={Settings.draggable.get()}
					onChange={() => Settings.draggable.set(!Settings.draggable.get())}
				/>
				<span>allow dragging</span>
			</div>
		</>
	);
}
