import { Root, Signal } from "@kixelated/signals";
import solid from "@kixelated/signals/solid";
import type { JSX } from "solid-js/jsx-runtime";
import IconCursorMove from "~icons/mdi/cursor-move";
import IconPotato from "~icons/mdi/fried-potatoes";
import IconHeadphones from "~icons/mdi/headphones";
import IconMicrophone from "~icons/mdi/microphone";

const Settings = {
	draggable: new Signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: new Signal<number>(Number.parseFloat(localStorage.getItem("settings.volume") ?? "1")),
	muted: new Signal(localStorage.getItem("settings.muted") === "true"),
	potato: new Signal(localStorage.getItem("settings.potato") === "true"),
	headphones: new Signal(localStorage.getItem("settings.headphones") !== "false"),
	echo: new Signal(false), // never saved, it's just for testing

	microphoneGain: new Signal(Number.parseFloat(localStorage.getItem("settings.microphone.gain") ?? "1")),
};

const signals = new Root();

signals.subscribe(Settings.draggable, (draggable) => {
	localStorage.setItem("settings.draggable", draggable.toString());
});

signals.subscribe(Settings.volume, (volume) => {
	localStorage.setItem("settings.volume", volume.toString());
});

signals.subscribe(Settings.muted, (muted) => {
	localStorage.setItem("settings.muted", muted.toString());
});

signals.subscribe(Settings.potato, (potato) => {
	localStorage.setItem("settings.potato", potato.toString());
});

signals.subscribe(Settings.headphones, (headphones) => {
	localStorage.setItem("settings.headphones", headphones.toString());
});

signals.subscribe(Settings.microphoneGain, (gain) => {
	localStorage.setItem("settings.microphone.gain", gain.toString());
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
	const headphones = solid(Settings.headphones);
	const draggable = solid(Settings.draggable);
	const potato = solid(Settings.potato);
	const echo = solid(Settings.echo);

	return (
		<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
			<input type="checkbox" checked={headphones()} onChange={() => Settings.headphones.set((p) => !p)} />
			<span>headphones</span>
			<span title="You're cool and wear headphones instead of using speakers in public. Disables echo cancellation.">
				<IconHeadphones />
			</span>

			<input type="checkbox" checked={draggable()} onChange={() => Settings.draggable.set((p) => !p)} />
			<span>remote dragging</span>
			<span title="Allow other users to move your camera/screen. You can still move yourself by dragging or using the arrow keys.">
				<IconCursorMove />
			</span>

			<input type="checkbox" checked={echo()} onChange={() => Settings.echo.set((p) => !p)} />
			<span>echo audio</span>
			<span title="Listen to your own audio. This is useful if you want to hear your own voice for debugging.">
				<IconMicrophone />
			</span>

			<input type="checkbox" checked={potato()} onChange={() => Settings.potato.set((p) => !p)} />
			<span>potato mode</span>
			<span title="Disable special effects and laggy animations.">
				<IconPotato />
			</span>
		</div>
	);
}
