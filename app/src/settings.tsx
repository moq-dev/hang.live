import * as Api from "@hang/api";
import { Effect, Signal } from "@kixelated/signals";
import solid from "@kixelated/signals/solid";
import type { JSX } from "solid-js/jsx-runtime";
import { Tab } from "./components/meme-selector";

const Settings = {
	draggable: new Signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: new Signal<number>(Number.parseFloat(localStorage.getItem("settings.volume") ?? "1")),
	muted: new Signal(localStorage.getItem("settings.muted") === "true"),
	debug: new Signal(localStorage.getItem("settings.debug") === "true"),

	renderCaptions: new Signal(localStorage.getItem("settings.renderCaptions") !== "false"),
	captureCaptions: new Signal(
		supportsWebGPU() ? localStorage.getItem("settings.captureCaptions") !== "false" : false,
	),

	microphoneGain: new Signal(Number.parseFloat(localStorage.getItem("settings.microphone.gain") ?? "1")),
	tts: new Signal(localStorage.getItem("settings.tts") !== "false"),

	// Device states that persist across sessions
	microphoneEnabled: new Signal(localStorage.getItem("settings.microphone.enabled") === "true"),
	cameraEnabled: new Signal(localStorage.getItem("settings.camera.enabled") === "true"),

	// Guest account settings
	guest: new Signal<Api.Account.Info | undefined>(undefined),

	// Meme selector settings
	memeTab: new Signal((localStorage.getItem("settings.meme.tab") as Tab) ?? "emoji"),
};

const guestRaw = localStorage.getItem("settings.guest");
if (guestRaw) {
	try {
		Settings.guest.set(Api.Account.infoSchema.safeParse(JSON.parse(guestRaw)).data);
	} catch (error) {
		console.error("Failed to parse guest settings", error);
	}
}

const volume = Settings.volume.peek();
if (Number.isNaN(volume) || volume < 0 || volume > 1) {
	Settings.volume.set(1);
}

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
	if (!supportsWebGPU()) {
		// Don't save this setting if WebGPU is not supported.
		localStorage.removeItem("settings.captureCaptions");
	} else {
		localStorage.setItem("settings.captureCaptions", transcription.toString());
	}
});

effect.subscribe(Settings.tts, (tts) => {
	localStorage.setItem("settings.tts", tts.toString());
});

effect.subscribe(Settings.microphoneEnabled, (enabled) => {
	localStorage.setItem("settings.microphone.enabled", enabled.toString());
});

effect.subscribe(Settings.cameraEnabled, (enabled) => {
	localStorage.setItem("settings.camera.enabled", enabled.toString());
});

effect.subscribe(Settings.guest, (guest) => {
	localStorage.setItem("settings.guest", JSON.stringify(guest));
});

effect.subscribe(Settings.memeTab, (tab) => {
	localStorage.setItem("settings.meme.tab", tab);
});

// Mostly just to avoid console warnings about signals not being closed
document.addEventListener("unload", () => {
	effect.close();
});

export default Settings;

export function Modal(): JSX.Element {
	const draggable = solid(Settings.draggable);
	const captions = solid(Settings.captureCaptions);
	const tts = solid(Settings.tts);

	return (
		<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
			<input type="checkbox" checked={draggable()} onChange={() => Settings.draggable.set((p) => !p)} />
			<span>allow dragging</span>
			<span title="Allow other users to move your camera/screen. You can still move yourself by dragging or using the arrow keys.">
				<span class="icon-[mdi--cursor-move]" />
			</span>

			<input
				type="checkbox"
				checked={captions()}
				disabled={!supportsWebGPU()}
				onChange={() => Settings.captureCaptions.set((p) => !p)}
			/>
			<span>generate captions</span>
			<span title="Generate closed captions for your own speech. Requires WebGPU support.">
				<span class="icon-[mdi--closed-caption]" />
			</span>

			<input type="checkbox" checked={tts()} onChange={() => Settings.tts.set((p) => !p)} />
			<span>text-to-speech</span>
			<span title="Enable text-to-speech for announcing members. WebGPU is recommended.">
				<span class="icon-[mdi--text-to-speech]" />
			</span>
		</div>
	);
}

export function supportsWebGPU() {
	// @ts-expect-error Not typed yet.
	return !!navigator.gpu;
}
