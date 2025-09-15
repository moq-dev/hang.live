import * as Api from "@hang/api/client";
import { Effect, Signal } from "@kixelated/signals";
import solid from "@kixelated/signals/solid";
import { createSelector, createSignal, Match, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { z } from "zod";
import { Tab } from "./components/meme-selector";
import { Sound } from "./room/sound";

const ttsSchema = z.enum(["none", "low", "high"]);
type TTS = z.infer<typeof ttsSchema>;

const Settings = {
	draggable: new Signal(localStorage.getItem("settings.draggable") !== "false"),
	volume: new Signal<number>(Number.parseFloat(localStorage.getItem("settings.volume") ?? "1")),
	muted: new Signal(localStorage.getItem("settings.muted") === "true"),

	captions: {
		render: new Signal(localStorage.getItem("settings.captions.render") !== "false"),
		capture: new Signal(supportsWebGPU() ? localStorage.getItem("settings.captions.capture") !== "false" : false),
	},

	tts: new Signal<TTS>("low"),

	// Device states that persist across sessions
	microphone: {
		enabled: new Signal(localStorage.getItem("settings.microphone.enabled") === "true"),
		gain: new Signal(Number.parseFloat(localStorage.getItem("settings.microphone.gain") ?? "1")),
		device: new Signal(localStorage.getItem("settings.microphone.device") ?? undefined),
	},
	camera: {
		enabled: new Signal(localStorage.getItem("settings.camera.enabled") === "true"),
		device: new Signal(localStorage.getItem("settings.camera.device") ?? undefined),
	},

	// Guest account settings
	guest: new Signal<Api.Account.Info | undefined>(undefined),

	// Meme selector settings
	meme: {
		tab: new Signal((localStorage.getItem("settings.meme.tab") as Tab) ?? "emoji"),
	},
};

const guestRaw = localStorage.getItem("settings.guest");
if (guestRaw) {
	try {
		Settings.guest.set(Api.AccountInfoSchema.safeParse(JSON.parse(guestRaw)).data);
	} catch (error) {
		console.error("Failed to parse guest settings", error);
	}
}

// Load and validate announcements setting
const ttsRaw = localStorage.getItem("settings.tts");
if (ttsRaw) {
	const parsed = ttsSchema.safeParse(ttsRaw);
	if (parsed.success) {
		Settings.tts.set(parsed.data);
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

effect.subscribe(Settings.microphone.gain, (gain) => {
	localStorage.setItem("settings.microphone.gain", gain.toString());
});

effect.subscribe(Settings.captions.render, (closedCaptions) => {
	localStorage.setItem("settings.captions.render", closedCaptions.toString());
});

effect.subscribe(Settings.captions.capture, (transcription) => {
	if (!supportsWebGPU()) {
		// Don't save this setting if WebGPU is not supported.
		localStorage.removeItem("settings.captions.capture");
	} else {
		localStorage.setItem("settings.captions.capture", transcription.toString());
	}
});

effect.subscribe(Settings.tts, (tts) => {
	localStorage.setItem("settings.tts", tts);
});

effect.subscribe(Settings.microphone.enabled, (enabled) => {
	localStorage.setItem("settings.microphone.enabled", enabled.toString());
});

effect.subscribe(Settings.camera.enabled, (enabled) => {
	localStorage.setItem("settings.camera.enabled", enabled.toString());
});

effect.subscribe(Settings.guest, (guest) => {
	localStorage.setItem("settings.guest", JSON.stringify(guest));
});

effect.subscribe(Settings.meme.tab, (tab) => {
	localStorage.setItem("settings.meme.tab", tab);
});

effect.subscribe(Settings.microphone.device, (device) => {
	if (device) {
		localStorage.setItem("settings.microphone.device", device);
	} else {
		localStorage.removeItem("settings.microphone.device");
	}
});

effect.subscribe(Settings.camera.device, (device) => {
	if (device) {
		localStorage.setItem("settings.camera.device", device);
	} else {
		localStorage.removeItem("settings.camera.device");
	}
});

// Mostly just to avoid console warnings about signals not being closed
document.addEventListener("unload", () => {
	effect.close();
});

export default Settings;

export function Modal(props: { sound: Sound }): JSX.Element {
	const draggable = solid(Settings.draggable);
	const tts = createSelector(solid(Settings.tts));
	const webGPUSupported = supportsWebGPU();

	const progress = solid(props.sound.tts.progress);
	const [isGenerating, setIsGenerating] = createSignal(false);

	const load = (quality: "high" | "low" | "none") => {
		Settings.tts.set(quality);
	};

	const testPhrases = [
		"My mom bought me this new laptop and it gets really hot when the chat is being spammed.",
		"Now my leg is starting to hurt because it is getting so hot.",
		"Please, if you don't want me to get burned, then dont spam the chat.",
	];
	let phraseNum = 0;

	return (
		<div class="flex flex-col gap-5">
			{/* Title */}
			<h3 class="text-white font-semibold mb-1 text-2xl underline decoration-link-hue underline-offset-2">
				Advanced Settings
			</h3>
			{/* Announcements */}
			<div class="flex flex-wrap gap-4">
				<div class="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 flex-shrink-0 self-start">
					<span class="icon-[mdi--text-to-speech] text-lg text-white/70" />
				</div>
				<div class="flex flex-col gap-0.5">
					<span class="text-white/90 font-medium">Announce Join/Leave</span>
					<span class="text-xs text-white/50">
						{tts("none") && "No voice announcements"}
						{tts("low") && (
							<>
								Low quality TTS with{" "}
								<a
									href="https://github.com/KittenML/KittenTTS"
									target="_blank"
									rel="noopener noreferrer"
									class="decoration-yellow-500"
								>
									Kitten
								</a>
								.
							</>
						)}
						{tts("high") && (
							<>
								High quality TTS with{" "}
								<a
									href="https://github.com/hexgrad/kokoro"
									target="_blank"
									rel="noopener noreferrer"
									class="decoration-green-500"
								>
									Kokoro
								</a>
								.
							</>
						)}
					</span>
				</div>
				<div class="inline-flex rounded-lg bg-white/8 p-1 flex-grow">
					<button
						type="button"
						class="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
						classList={{
							"bg-gray-500 text-white shadow-sm": tts("none"),
							"text-white/60 hover:text-white/80 hover:bg-white/5": !tts("none"),
						}}
						onClick={() => load("none")}
					>
						None
					</button>
					<button
						type="button"
						class="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
						classList={{
							"bg-yellow-500 text-white shadow-sm": tts("low"),
							"text-white/60 hover:text-white/80 hover:bg-white/5": !tts("low"),
						}}
						onClick={() => load("low")}
					>
						Low
					</button>
					<button
						type="button"
						class="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
						classList={{
							"bg-green-500 text-white shadow-sm": tts("high"),
							"text-white/60 hover:text-white/80 hover:bg-white/5": !tts("high"),
							"opacity-40 cursor-not-allowed": !webGPUSupported,
						}}
						onClick={() => webGPUSupported && load("high")}
						disabled={!webGPUSupported}
						title={!webGPUSupported ? "WebGPU required" : ""}
					>
						High{!webGPUSupported ? "*" : ""}
					</button>
				</div>
			</div>
			{/* Progress bar */}
			<button
				type="button"
				class="relative w-full bg-white/10 rounded-full overflow-hidden transition-all hover:brightness-110 cursor-pointer"
				classList={{
					"h-8": !tts("none"),
					"h-0": !!tts("none"),
				}}
				onClick={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (isGenerating() || progress() !== 1) return;

					setIsGenerating(true);

					const phrase = testPhrases[phraseNum];
					phraseNum = (phraseNum + 1) % testPhrases.length;

					await props.sound.tts.say(phrase);
					setIsGenerating(false);
				}}
				disabled={isGenerating() || progress() !== 1}
			>
				<div
					class="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-300"
					style={{ width: `${(progress() ?? 0) * 100}%` }}
				/>
				<div class="absolute inset-0 flex items-center justify-center">
					<span class="text-sm text-white/80 font-medium">
						<Switch fallback="Test">
							<Match when={(progress() ?? 0) < 1}>Loading</Match>
							<Match when={isGenerating()}>Generating</Match>
						</Switch>
					</span>
				</div>
			</button>
			<div class="h-px bg-white/10" />
			<div class="h-px bg-white/10" />
			<div class="flex flex-wrap gap-4">
				<div class="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 flex-shrink-0 self-start">
					<span class="icon-[mdi--cursor-move] text-lg text-white/70" />
				</div>
				<div class="flex flex-col gap-0.5">
					<span class="text-white/90 font-medium">Remote Control</span>
					<span class="text-xs text-white/50">Allow others to drag/resize your camera</span>
				</div>
				<input
					type="checkbox"
					checked={draggable()}
					onChange={() => Settings.draggable.set((p) => !p)}
					class="cursor-pointer accent-blue-500 group-hover:accent-blue-400 transition-colors flex-grow"
				/>
			</div>
		</div>
	);
}

export function supportsWebGPU() {
	// @ts-expect-error Not typed yet.
	return !!navigator.gpu;
}
