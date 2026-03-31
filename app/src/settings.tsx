import * as Api from "@hang/api/client";
import { Effect, Signal } from "@moq/signals";
import solid from "@moq/signals/solid";
import { createSelector, createSignal, Match, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { z } from "zod";
import { Tab } from "./components/meme-selector";
import { Sound } from "./room/sound";

const ttsSchema = z.enum(["none", "low", "high"]);
type TTS = z.infer<typeof ttsSchema>;

// We use this function to verify the setting is valid and prevent defaulting to "low".
// Otherwise, we might start downloading the model.
function loadTTS() {
	// Load and validate announcements setting
	const ttsRaw = localStorage.getItem("settings.audio.tts");
	if (ttsRaw) {
		const parsed = ttsSchema.safeParse(ttsRaw);
		if (parsed.success) {
			return parsed.data;
		}
	}
	return "low";
}

export const Settings = {
	draggable: new Signal(localStorage.getItem("settings.draggable") !== "false"),

	audio: {
		enabled: new Signal(localStorage.getItem("settings.audio.enabled") !== "false"),
		volume: new Signal<number>(Number.parseFloat(localStorage.getItem("settings.audio.volume") ?? "1")),
		tts: new Signal<TTS>(loadTTS()),
	},

	captions: {
		render: new Signal(localStorage.getItem("settings.captions.render") !== "false"),
		capture: new Signal(supportsWebGPU() ? localStorage.getItem("settings.captions.capture") !== "false" : false),
	},

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

	// Cached account ID stuff; not validated.
	account: {
		// A random ID starting with "guest/" that is used to identify ourselves on reload.
		guest: new Signal<string | undefined>(localStorage.getItem("settings.account.guest") ?? undefined),
		name: new Signal<string | undefined>(localStorage.getItem("settings.account.name") ?? Api.randomName()),
		avatar: new Signal<string | undefined>(localStorage.getItem("settings.account.avatar") ?? Api.randomAvatar()),
	},

	oauth: {
		token: new Signal<string | undefined>(localStorage.getItem("settings.oauth.token") ?? undefined),
		random: new Signal<string | undefined>(localStorage.getItem("settings.oauth.random") ?? undefined),
	},

	// Meme selector settings
	meme: {
		tab: new Signal((localStorage.getItem("settings.meme.tab") as Tab) ?? "emoji"),
	},

	// Tutorial settings
	tutorial: {
		step: new Signal(Number.parseInt(localStorage.getItem("settings.tutorial.step") ?? "0", 10)),
	},

	// Rendering settings
	render: {
		scale: new Signal<number>(
			(() => {
				const stored = localStorage.getItem("settings.render.scale");
				if (stored) {
					const parsed = Number.parseFloat(stored);
					if (!Number.isNaN(parsed) && parsed > 0 && parsed <= window.devicePixelRatio) {
						return parsed;
					}
				}
				return window.devicePixelRatio;
			})(),
		),
	},

	// Debug settings
	debug: {
		tracks: new Signal(localStorage.getItem("settings.debug.tracks") === "true"),
	},

	clear: () => {
		localStorage.clear();
		window.location.reload();
	},
};

const volume = Settings.audio.volume.peek();
if (Number.isNaN(volume) || volume < 0 || volume > 1) {
	Settings.audio.volume.set(1);
}

const effect = new Effect();

effect.subscribe(Settings.draggable, (draggable) => {
	localStorage.setItem("settings.draggable", draggable.toString());
});

effect.subscribe(Settings.audio.volume, (volume) => {
	localStorage.setItem("settings.audio.volume", volume.toString());
});

effect.subscribe(Settings.audio.enabled, (enabled) => {
	localStorage.setItem("settings.audio.enabled", enabled.toString());
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

effect.subscribe(Settings.audio.tts, (tts) => {
	localStorage.setItem("settings.audio.tts", tts);
});

effect.subscribe(Settings.microphone.enabled, (enabled) => {
	localStorage.setItem("settings.microphone.enabled", enabled.toString());
});

effect.subscribe(Settings.camera.enabled, (enabled) => {
	localStorage.setItem("settings.camera.enabled", enabled.toString());
});

effect.subscribe(Settings.account.guest, (id) => {
	if (id) {
		localStorage.setItem("settings.account.guest", id);
	} else {
		localStorage.removeItem("settings.account.guest");
	}
});

effect.subscribe(Settings.account.name, (name) => {
	if (name) {
		localStorage.setItem("settings.account.name", name);
	} else {
		localStorage.removeItem("settings.account.name");
	}
});

effect.subscribe(Settings.account.avatar, (avatar) => {
	if (avatar) {
		localStorage.setItem("settings.account.avatar", avatar);
	} else {
		localStorage.removeItem("settings.account.avatar");
	}
});

effect.subscribe(Settings.oauth.token, (token) => {
	if (token) {
		localStorage.setItem("settings.oauth.token", token);
	} else {
		localStorage.removeItem("settings.oauth.token");
	}
});

effect.subscribe(Settings.oauth.random, (random) => {
	if (random) {
		localStorage.setItem("settings.oauth.random", random);
	} else {
		localStorage.removeItem("settings.oauth.random");
	}
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

effect.subscribe(Settings.tutorial.step, (step) => {
	localStorage.setItem("settings.tutorial.step", step.toString());
});

effect.subscribe(Settings.render.scale, (ratio) => {
	localStorage.setItem("settings.render.scale", ratio.toString());
});

effect.subscribe(Settings.debug.tracks, (enabled) => {
	localStorage.setItem("settings.debug.tracks", enabled.toString());
});

// Mostly just to avoid console warnings about signals not being closed
document.addEventListener("unload", () => {
	effect.close();
});

export default Settings;

export function Modal(props: { sound: Sound }): JSX.Element {
	const draggable = solid(Settings.draggable);
	const debugTracks = solid(Settings.debug.tracks);
	const tts = createSelector(solid(Settings.audio.tts));
	const webGPUSupported = supportsWebGPU();
	const devicePixelRatio = solid(Settings.render.scale);
	const maxDevicePixelRatio = window.devicePixelRatio;

	// Calculate available pixel ratio options (0.5x, 1x, 2x, 4x, 8x)
	const pixelRatioOptions: number[] = [0.5];
	for (let i = 1; i <= maxDevicePixelRatio; i *= 2) {
		pixelRatioOptions.push(i);
	}

	const isSelectedRatio = createSelector(() => devicePixelRatio());

	const progress = solid(props.sound.tts.progress);
	const [isGenerating, setIsGenerating] = createSignal(false);

	const load = (quality: "high" | "low" | "none") => {
		Settings.audio.tts.set(quality);
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
				<div class="flex flex-col gap-0.5 flex-grow">
					<span class="text-white/90 font-medium">Announce Join/Leave</span>
					<span class="text-xs text-white/50">
						{tts("none") && "No voice announcements"}
						{tts("low") && (
							<>
								Low quality TTS with{" "}
								<a
									href="https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis"
									target="_blank"
									rel="noopener noreferrer"
									class="decoration-yellow-500"
								>
									SpeechSynthesis
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
				<div class="inline-flex rounded-lg bg-white/8 p-1">
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
					{webGPUSupported && (
						<button
							type="button"
							class="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
							classList={{
								"bg-green-500 text-white shadow-sm": tts("high"),
								"text-white/60 hover:text-white/80 hover:bg-white/5": !tts("high"),
							}}
							onClick={() => load("high")}
						>
							High
						</button>
					)}
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
			{/* Device Pixel Ratio */}
			<div class="flex flex-wrap gap-4">
				<div class="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 flex-shrink-0 self-start">
					<span class="icon-[mdi--monitor-screenshot] text-lg text-white/70" />
				</div>
				<div class="flex flex-col gap-0.5 flex-grow">
					<span class="text-white/90 font-medium">Pixel Ratio</span>
					<span class="text-xs text-white/50">Increase for better quality, but worse performance.</span>
				</div>
				<div class="inline-flex rounded-lg bg-white/8 p-1">
					{pixelRatioOptions.map((ratio) => (
						<button
							type="button"
							class="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
							classList={{
								"bg-blue-500 text-white shadow-sm": isSelectedRatio(ratio),
								"text-white/60 hover:text-white/80 hover:bg-white/5": !isSelectedRatio(ratio),
							}}
							onClick={() => Settings.render.scale.set(ratio)}
						>
							{ratio}x
						</button>
					))}
				</div>
			</div>
			<div class="h-px bg-white/10" />
			<div class="flex flex-wrap gap-4">
				<div class="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 flex-shrink-0 self-start">
					<span class="icon-[mdi--cursor-move] text-lg text-white/70" />
				</div>
				<div class="flex flex-col gap-0.5 flex-grow">
					<span class="text-white/90 font-medium">Remote Control</span>
					<span class="text-xs text-white/50">Allow others to drag/resize your camera</span>
				</div>
				<input
					type="checkbox"
					checked={draggable()}
					onChange={() => Settings.draggable.update((p) => !p)}
					class="cursor-pointer accent-blue-500 group-hover:accent-blue-400 transition-colors w-18"
				/>
			</div>
			<div class="h-px bg-white/10" />
			<div class="flex flex-wrap gap-4">
				<div class="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 flex-shrink-0 self-start">
					<span class="icon-[mdi--bug] text-lg text-white/70" />
				</div>
				<div class="flex flex-col gap-0.5 flex-grow">
					<span class="text-white/90 font-medium">Debug</span>
					<span class="text-xs text-white/50">Show the super cool debug stats</span>
				</div>
				<input
					type="checkbox"
					checked={debugTracks()}
					onChange={() => Settings.debug.tracks.update((p) => !p)}
					class="cursor-pointer accent-blue-500 group-hover:accent-blue-400 transition-colors w-18"
				/>
			</div>
		</div>
	);
}

export function supportsWebGPU() {
	return !!navigator.gpu;
}
