import { Signals, signal } from "@kixelated/signals";
import { JSX } from "solid-js/jsx-runtime";

import IconPotato from "~icons/mdi/fried-potatoes";
import IconHelp from "~icons/mdi/help-box";

const Settings = {
	draggable: signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: signal(localStorage.getItem("settings.volume") ?? "100"),
	potato: signal(localStorage.getItem("settings.potato") === "true"),
	pan: signal(localStorage.getItem("settings.pan") !== "false"),
};

const signals = new Signals();

signals.effect(() => {
	localStorage.setItem("settings.draggable", Settings.draggable.get().toString());
});

signals.effect(() => {
	localStorage.setItem("settings.volume", Settings.volume.get().toString());
});

signals.effect(() => {
	localStorage.setItem("settings.potato", Settings.potato.get().toString());
});

signals.effect(() => {
	localStorage.setItem("settings.pan", Settings.pan.get().toString());
});

signals.effect(() => {
	if (Settings.potato.get()) {
		document.documentElement.classList.add("potato");
	} else {
		document.documentElement.classList.remove("potato");
	}
});

// Mostly just to avoid console warnings about signals not being closed
document.addEventListener("unload", () => {
	signals.close();
});

export default Settings;

export function Modal(): JSX.Element {
	return (
		<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
			<input
				type="checkbox"
				checked={Settings.pan.get()}
				onChange={() => Settings.pan.set(!Settings.pan.get())}
			/>
			<span>audio panning</span>
			<span title="Play audio from left/right speakers based on a user's position. Use headphones for the best experience.">
				<IconHelp />
			</span>

			<input
				type="checkbox"
				checked={Settings.draggable.get()}
				onChange={() => Settings.draggable.set(!Settings.draggable.get())}
			/>
			<span>remote dragging</span>
			<span title="Allow other users to move your camera/screen. You can still move yourself by dragging or using the arrow keys.">
				<IconHelp />
			</span>

			<input
				type="checkbox"
				checked={Settings.potato.get()}
				onChange={() => Settings.potato.set(!Settings.potato.get())}
			/>
			<span>potato mode</span>
			<span title="Disable special effects and laggy animations.">
				<IconPotato />
			</span>
		</div>
	);
}
