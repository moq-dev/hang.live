import { Root, Signal } from "@kixelated/signals";
import { JSX } from "solid-js/jsx-runtime";

import IconPotato from "~icons/mdi/fried-potatoes";
import IconHelp from "~icons/mdi/help-box";

const Settings = {
	draggable: new Signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: new Signal(localStorage.getItem("settings.volume") ?? "100"),
	potato: new Signal(localStorage.getItem("settings.potato") === "true"),
	pan: new Signal(localStorage.getItem("settings.pan") !== "false"),
};

const signals = new Root();

signals.subscribe(Settings.draggable, (draggable) => {
	localStorage.setItem("settings.draggable", draggable.toString());
});

signals.subscribe(Settings.volume, (volume) => {
	localStorage.setItem("settings.volume", volume.toString());
});

signals.subscribe(Settings.potato, (potato) => {
	localStorage.setItem("settings.potato", potato.toString());
});

signals.subscribe(Settings.pan, (pan) => {
	localStorage.setItem("settings.pan", pan.toString());
});

signals.subscribe(Settings.potato, (potato) => {
	if (potato) {
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
	const pan = Settings.pan.solid();
	const draggable = Settings.draggable.solid();
	const potato = Settings.potato.solid();

	return (
		<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
			<input type="checkbox" checked={pan()} onChange={() => Settings.pan.set(!pan())} />
			<span>audio panning</span>
			<span title="Play audio from left/right speakers based on a user's position. Use headphones for the best experience.">
				<IconHelp />
			</span>

			<input type="checkbox" checked={draggable()} onChange={() => Settings.draggable.set(!draggable())} />
			<span>remote dragging</span>
			<span title="Allow other users to move your camera/screen. You can still move yourself by dragging or using the arrow keys.">
				<IconHelp />
			</span>

			<input type="checkbox" checked={potato()} onChange={() => Settings.potato.set(!potato())} />
			<span>potato mode</span>
			<span title="Disable special effects and laggy animations.">
				<IconPotato />
			</span>
		</div>
	);
}
