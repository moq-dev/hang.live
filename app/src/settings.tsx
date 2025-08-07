import { Effect, Signal } from "@kixelated/signals";
import solid from "@kixelated/signals/solid";
import type { JSX } from "solid-js/jsx-runtime";
import IconBug from "~icons/mdi/bug";
import IconCaptions from "~icons/mdi/closed-caption";
import IconCursorMove from "~icons/mdi/cursor-move";
import IconHeadphones from "~icons/mdi/headphones";

const Settings = {
	draggable: new Signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: new Signal<number>(Number.parseFloat(localStorage.getItem("settings.volume") ?? "1")),
	muted: new Signal(localStorage.getItem("settings.muted") === "true"),
	headphones: new Signal(localStorage.getItem("settings.headphones") === "true"),
	debug: new Signal(localStorage.getItem("settings.debug") === "true"),

	renderCaptions: new Signal(localStorage.getItem("settings.renderCaptions") !== "false"),
	captureCaptions: new Signal(localStorage.getItem("settings.captureCaptions") !== "false"),

	microphoneGain: new Signal(Number.parseFloat(localStorage.getItem("settings.microphone.gain") ?? "1")),
};

const effect = new Effect();

effect.subscribe(Settings.draggable, (draggable) => {
	localStorage.setItem("settings.draggable", draggable.toString());
});

effect.subscribe(Settings.volume, (volume) => {
	localStorage.setItem("settings.volume", volume.toString());
});

effect.subscribe(Settings.muted, (muted) => {
	localStorage.setItem("settings.muted", muted.toString());
});

effect.subscribe(Settings.headphones, (headphones) => {
	localStorage.setItem("settings.headphones", headphones.toString());
});

effect.subscribe(Settings.microphoneGain, (gain) => {
	localStorage.setItem("settings.microphone.gain", gain.toString());
});

effect.subscribe(Settings.debug, (debug) => {
	localStorage.setItem("settings.debug", debug.toString());
});

effect.subscribe(Settings.renderCaptions, (closedCaptions) => {
	localStorage.setItem("settings.renderCaptions", closedCaptions.toString());
});

effect.subscribe(Settings.captureCaptions, (transcription) => {
	localStorage.setItem("settings.captureCaptions", transcription.toString());
});

// Mostly just to avoid console warnings about signals not being closed
document.addEventListener("unload", () => {
	effect.close();
});

export default Settings;

export function Modal(): JSX.Element {
	const headphones = solid(Settings.headphones);
	const draggable = solid(Settings.draggable);
	const debug = solid(Settings.debug);
	const captions = solid(Settings.captureCaptions);

	return (
		<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
			<input type="checkbox" checked={headphones()} onChange={() => Settings.headphones.set((p) => !p)} />
			<span>headphones</span>
			<span title="You're cool and wear headphones instead of using speakers in public. Disables echo cancellation.">
				<IconHeadphones />
			</span>

			<input type="checkbox" checked={draggable()} onChange={() => Settings.draggable.set((p) => !p)} />
			<span>allow dragging</span>
			<span title="Allow other users to move your camera/screen. You can still move yourself by dragging or using the arrow keys.">
				<IconCursorMove />
			</span>

			<input type="checkbox" checked={debug()} onChange={() => Settings.debug.set((p) => !p)} />
			<span>debug</span>
			<span title="Show debug visualizations.">
				<IconBug />
			</span>

			<input type="checkbox" checked={captions()} onChange={() => Settings.captureCaptions.set((p) => !p)} />
			<span>generate captions</span>
			<span title="Generate closed captions for your own speech.">
				<IconCaptions />
			</span>
		</div>
	);
}
