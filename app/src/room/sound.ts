import { Effect, Signal } from "@kixelated/signals";
import * as Comlink from "comlink";
import Settings from "../settings";

import type { TTS } from "./tts";

const NOTIFICATIONS = {
	bup: "/notification/bup.opus",
	//bye: "/notification/bye.opus",
	chat: [
		"/notification/chat1.opus",
		"/notification/chat2.opus",
		"/notification/chat3.opus",
		"/notification/chat4.opus",
		"/notification/chat5.opus",
	],
	select: "/notification/select.opus",
	//sup: "/notification/sup.opus",
} as const;

export type NotificationSound = keyof typeof NOTIFICATIONS;
const FADE_TIME = 0.2;
const GAIN_MIN = 0.001;

export type SoundProps = {
	enabled?: boolean;
};

export class Sound {
	enabled: Signal<boolean>;
	context: AudioContext;
	gain: GainNode;

	#sounds: Map<NotificationSound, Promise<AudioBuffer[]>>;
	#signals = new Effect();

	#tts: Comlink.Remote<TTS> | undefined;
	#ttsQueue: AudioBufferSourceNode[] = [];

	suspended: Signal<boolean>;

	constructor(props?: SoundProps) {
		this.context = new AudioContext({
			latencyHint: "playback",
		});
		this.enabled = new Signal(props?.enabled ?? false);

		if (!this.enabled.peek()) {
			this.context.suspend();
		}

		this.gain = new GainNode(this.context);
		this.gain.connect(this.context.destination);

		const sounds = new Map();

		for (const [sound, url] of Object.entries(NOTIFICATIONS)) {
			const urls = Array.isArray(url) ? url : [url];
			const load = Promise.all(
				urls.map(async (url) => {
					const response = await fetch(url);
					const data = await response.arrayBuffer();
					return await this.context.decodeAudioData(data);
				}),
			);
			sounds.set(sound, load);
		}

		this.suspended = new Signal(this.context.state === "suspended");

		this.context.onstatechange = () => {
			this.suspended.set(this.context.state === "suspended");
		};

		this.#signals.effect((effect) => {
			const enabled = effect.get(this.enabled);
			const suspended = effect.get(this.suspended);

			if (enabled && suspended) {
				this.context.resume();
			} else if (!enabled && !suspended) {
				this.context.suspend();
			}
		});

		this.#signals.effect((effect) => {
			if (!effect.get(Settings.tts)) return;

			// Only start loading the TTS model when sound is enabled.
			if (effect.get(this.suspended)) return;

			const worker = new Worker(new URL("./tts", import.meta.url), { type: "module" });
			effect.cleanup(() => worker.terminate());

			this.#tts = Comlink.wrap<TTS>(worker);
			effect.cleanup(() => {
				this.#tts = undefined;
			});
		});

		this.#sounds = sounds;

		this.#signals.effect(this.#runGain.bind(this));
	}

	#runGain(effect: Effect) {
		// Reduce the volume for notifications so we can hear them over everything else.
		const volume = effect.get(Settings.muted) ? 0 : effect.get(Settings.volume) / 2;

		// Cancel any scheduled transitions on change.
		effect.cleanup(() => this.gain.gain.cancelScheduledValues(this.gain.context.currentTime));

		if (volume < GAIN_MIN) {
			this.gain.gain.exponentialRampToValueAtTime(GAIN_MIN, this.gain.context.currentTime + FADE_TIME);
			this.gain.gain.setValueAtTime(0, this.gain.context.currentTime + FADE_TIME + 0.01);
		} else {
			this.gain.gain.exponentialRampToValueAtTime(volume, this.gain.context.currentTime + FADE_TIME);
		}
	}

	// Return a buffer for the sound, randomly selecting one if there are multiple.
	async load(sound: NotificationSound): Promise<AudioBuffer> {
		const buffers = await this.#sounds.get(sound);
		if (!buffers) throw new Error(`Sound "${String(sound)}" not loaded`);
		return buffers[Math.floor(Math.random() * buffers.length)];
	}

	async play(sound: NotificationSound) {
		if (this.suspended.peek()) return;

		const buffer = await this.load(sound);
		const source = new AudioBufferSourceNode(this.context, { buffer });
		source.connect(this.context.destination);
		source.start();
	}

	async say(text: string) {
		if (!this.#tts) return;
		if (this.suspended.peek()) return;

		// Give the worker at most 2s to load the model before timing out.
		const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
		const ready = await Promise.race([this.#tts.ready(), timeout]);

		if (!ready) {
			console.warn("TTS worker timed out");
			return;
		}

		const audioUrl = await this.#tts.generate(text);

		// Fetch the audio from the object URL
		const response = await fetch(audioUrl);
		const arrayBuffer = await response.arrayBuffer();
		const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

		// Play the audio through the panner
		const source = new AudioBufferSourceNode(this.context, { buffer: audioBuffer });
		source.connect(this.context.destination);

		// Queue the audio to play after the current one ends.
		if (this.#ttsQueue.length === 0) {
			source.start();
		}

		this.#ttsQueue.push(source);
		source.onended = () => {
			this.#ttsQueue.shift();
			if (this.#ttsQueue.length > 0) {
				this.#ttsQueue[0].start();
			}
		};

		// Clean up the object URL
		URL.revokeObjectURL(audioUrl);
	}

	resume() {
		this.context.resume();
	}

	close() {
		this.context.close();
		this.gain.disconnect();
		this.#signals.close();
	}
}

import { MEME_AUDIO, MEME_AUDIO_LOOKUP, MEME_VIDEO, MEME_VIDEO_LOOKUP, MemeAudioName, MemeVideoName } from "./meme";

export class PannedNotifications {
	#parent: Sound;
	#panner: StereoPannerNode;

	// Optional, disabled in potato mode.
	analyser?: AnalyserNode;
	#buffer = new Uint8Array(1024);

	pan: Signal<number>;

	#signals = new Effect();

	constructor(parent: Sound, pan: Signal<number>) {
		this.#parent = parent;

		this.#panner = new StereoPannerNode(parent.context);
		this.#panner.connect(parent.gain);

		this.pan = pan;

		// Always create the analyser
		const analyser = new AnalyserNode(this.#parent.context, { fftSize: this.#buffer.length });
		this.#panner.connect(analyser);
		this.analyser = analyser;

		this.#signals.effect((effect) => {
			effect.cleanup(() => this.#panner.pan.cancelScheduledValues(this.#panner.context.currentTime));

			const pan = Math.max(-1, Math.min(1, effect.get(this.pan) * 2));
			this.#panner.pan.linearRampToValueAtTime(pan, this.#panner.context.currentTime + FADE_TIME);
		});
	}

	async notification(sound: NotificationSound) {
		if (this.#parent.suspended.peek()) return;

		const buffer = await this.#parent.load(sound);

		const source = new AudioBufferSourceNode(this.#parent.context, { buffer });
		source.connect(this.#panner);

		// TODO: For some reason, sounds don't play correctly on startup.
		// Add a 200ms delay for startup only, abusing that currentTime starts at 0.
		const when = Math.max(this.#parent.context.currentTime, 0.2);
		source.start(when);
	}

	// NOTE: We don't cache elements because the browser will.
	// Otherwise it would be a pain in the butt to manage if the same meme is played simultaneously.
	meme(name: string): HTMLAudioElement | HTMLVideoElement | undefined {
		// Make the name lowercase and remove hyphens for lookup
		const lower = name.toLowerCase();
		const lookupKey = lower.replace(/-/g, "");

		// Check lookup tables first (for slash commands without hyphens)
		const videoKey = MEME_VIDEO_LOOKUP[lookupKey] || (lower as MemeVideoName);
		const audioKey = MEME_AUDIO_LOOKUP[lookupKey] || (lower as MemeAudioName);

		const videoData = MEME_VIDEO[videoKey];
		const audioData = MEME_AUDIO[audioKey];

		// Use the video if it's available
		if (videoData) {
			const video = document.createElement("video") as HTMLVideoElement;
			video.src = `/meme/${videoData.file}`;

			if (this.#parent.suspended.peek()) {
				video.muted = true; // so we can start loading
				this.#signals.effect((effect) => {
					video.muted = effect.get(this.#parent.suspended); // unmute when the context is unsuspended
				});
			}

			video.autoplay = true;
			video.load();
			video.play();
			return video;
		}

		if (audioData) {
			const audio = new Audio(`/meme/${audioData.file}`);
			audio.autoplay = true;
			audio.load();
			return audio;
		}

		return undefined;
	}

	get context() {
		return this.#parent.context;
	}

	connect(node: AudioNode) {
		node.connect(this.#panner);
	}

	// NOTE: The buffer is reused, so don't hold on to it.
	analyze(): Uint8Array | undefined {
		if (!this.analyser) return undefined;
		this.analyser.getByteTimeDomainData(this.#buffer);
		return this.#buffer;
	}

	close() {
		this.#signals.close();
		this.#panner.disconnect();
		this.analyser?.disconnect();
	}
}
