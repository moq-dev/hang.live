import * as Api from "@hang/api/client";
import { Effect, Signal } from "@moq/signals";
import { createSelector, createSignal, Match, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { z } from "zod";
import type { Tab } from "./components/meme-selector";
import type { Sound } from "./room/sound";
import * as Speaker from "./speaker";
import { solid } from "./util/solid";

const ttsSchema = z.enum(["none", "low", "high"]);
type TTS = z.infer<typeof ttsSchema>;

// The signed-in identity, forgotten on logout while device and UI preferences stay.
const ACCOUNT_KEYS = [
	"settings.oauth.token",
	"settings.oauth.verifier",
	"settings.account.guest",
	"settings.account.name",
	"settings.account.avatar",
];

const effect = new Effect();

// A setting loaded from `key` with `parse`, and stored again whenever it changes; unset or empty removes it.
function persisted<T extends string | number | boolean | undefined>(
	key: string,
	parse: (stored: string | null) => T,
): Signal<T> {
	const signal = new Signal(parse(localStorage.getItem(key)));
	effect.subscribe(signal, (value) => {
		if (value === undefined || value === "") localStorage.removeItem(key);
		else localStorage.setItem(key, value.toString());
	});
	return signal;
}

// Without WebGPU, captions can't be transcribed here, so capture stays off and the stored choice is dropped.
if (!supportsWebGPU()) localStorage.removeItem("settings.captions.capture");

const Settings = {
	draggable: persisted("settings.draggable", (stored) => stored !== "false"),

	audio: {
		...Speaker.load(localStorage, effect),
		// An invalid value loads as the default rather than "none", which would skip the model download.
		tts: persisted<TTS>("settings.audio.tts", (stored) => ttsSchema.safeParse(stored).data ?? "low"),
	},

	captions: {
		render: persisted("settings.captions.render", (stored) => stored !== "false"),
		capture: supportsWebGPU()
			? persisted("settings.captions.capture", (stored) => stored !== "false")
			: new Signal(false),
	},

	// Device states that persist across sessions
	microphone: {
		enabled: persisted("settings.microphone.enabled", (stored) => stored === "true"),
		// Gain from the microphone's 0-200% slider; anything else, NaN included, resets to unity.
		gain: persisted("settings.microphone.gain", (stored) => {
			const gain = Number.parseFloat(stored ?? "1");
			return Speaker.validVolume(gain) ? gain : 1;
		}),
		device: persisted("settings.microphone.device", (stored) => stored ?? undefined),
	},
	camera: {
		enabled: persisted("settings.camera.enabled", (stored) => stored === "true"),
		device: persisted("settings.camera.device", (stored) => stored ?? undefined),
	},

	// Cached account identity and profile.
	account: {
		// The credential the API issued our random guest/ identity, presented to rejoin as it on reload.
		// A bare guest path stored by an older build proves nothing, so it is dropped for a fresh guest.
		guest: persisted("settings.account.guest", (stored) => Api.guestTokenSchema.safeParse(stored).data),
		name: persisted<string | undefined>("settings.account.name", (stored) => stored ?? Api.randomName()),
		avatar: persisted<string | undefined>("settings.account.avatar", (stored) => stored ?? Api.randomAvatar()),
	},

	oauth: {
		token: persisted("settings.oauth.token", (stored) => stored ?? undefined),
		// The secret for an in-progress login, redeemed with the code the OAuth redirect returns.
		verifier: persisted("settings.oauth.verifier", (stored) => stored ?? undefined),
	},

	// Meme selector settings
	meme: {
		tab: persisted("settings.meme.tab", (stored) => (stored as Tab | null) ?? "emoji"),
	},

	// Tutorial settings
	tutorial: {
		step: persisted("settings.tutorial.step", (stored) => Number.parseInt(stored ?? "0", 10)),
	},

	// Rendering settings
	render: {
		// The canvas's pixels per CSS pixel, at most the display's own.
		scale: persisted("settings.render.scale", (stored) => {
			const parsed = Number.parseFloat(stored ?? "");
			return parsed > 0 && parsed <= window.devicePixelRatio ? parsed : window.devicePixelRatio;
		}),
	},

	// Debug settings
	debug: {
		tracks: persisted("settings.debug.tracks", (stored) => stored === "true"),
	},

	// Sign out and reload as a fresh guest.
	logout: () => {
		for (const key of ACCOUNT_KEYS) localStorage.removeItem(key);
		window.location.reload();
	},
};

// The user's settings, persisted in localStorage.
export default Settings;

// The settings dialog.
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
					aria-label="Remote Control"
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
					aria-label="Debug"
					checked={debugTracks()}
					onChange={() => Settings.debug.tracks.update((p) => !p)}
					class="cursor-pointer accent-blue-500 group-hover:accent-blue-400 transition-colors w-18"
				/>
			</div>
		</div>
	);
}

function supportsWebGPU() {
	return !!navigator.gpu;
}
