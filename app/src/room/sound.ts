import { Effect, Signal } from "@kixelated/signals";
import Settings from "../settings";

import { TTS, TTSProps } from "./tts";

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
	enabled?: boolean | Signal<boolean>;

	tts?: TTSProps;
};

export class Sound {
	enabled: Signal<boolean>;
	tts: TTS;

	context: AudioContext;
	gain: GainNode;

	#sounds: Map<NotificationSound, Promise<AudioBuffer[]>>;
	#signals = new Effect();

	constructor(props?: SoundProps) {
		this.context = new AudioContext({
			latencyHint: "playback",
		});
		this.enabled = Signal.from(props?.enabled ?? false);
		this.tts = new TTS(this.context, props?.tts);

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

		this.#signals.effect((effect) => {
			const enabled = effect.get(this.enabled);

			if (enabled) {
				this.context.resume();
			} else if (!enabled) {
				this.context.suspend();
			}
		});

		this.#sounds = sounds;

		this.#signals.effect(this.#runGain.bind(this));
	}

	#runGain(effect: Effect) {
		// Reduce the volume for notifications so we can hear them over everything else.
		const volume = effect.get(Settings.audio.muted) ? 0 : effect.get(Settings.audio.volume) / 2;

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
		if (!this.enabled.peek()) return;

		const buffer = await this.load(sound);
		const source = new AudioBufferSourceNode(this.context, { buffer });
		source.connect(this.context.destination);
		source.start();
	}

	resume() {
		this.context.resume();
	}

	close() {
		this.context.close().catch(() => {});
		this.gain.disconnect();
		this.tts.close();
		this.#signals.close();
	}
}

import {
	MEME_AUDIO,
	MEME_AUDIO_LOOKUP,
	MEME_VIDEO,
	MEME_VIDEO_LOOKUP,
	Meme,
	MemeAudioName,
	MemeVideoName,
} from "./meme";

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
		if (!this.#parent.enabled.peek()) return;

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
	meme(name: string): Meme | undefined {
		// Make the name lowercase and remove hyphens for lookup
		const lower = name.toLowerCase();
		const lookupKey = lower.replace(/-/g, "");

		// Check lookup tables first (for slash commands without hyphens)
		const videoKey = MEME_VIDEO_LOOKUP[lookupKey] || (lower as MemeVideoName);
		const audioKey = MEME_AUDIO_LOOKUP[lookupKey] || (lower as MemeAudioName);

		const videoSource = MEME_VIDEO[videoKey];
		const audioSource = MEME_AUDIO[audioKey];

		// Use the video if it's available
		if (videoSource) {
			const video = document.createElement("video") as HTMLVideoElement;
			video.src = new URL(`/meme/${videoSource.file}`, import.meta.env.VITE_APP_URL).toString();

			if (!this.#parent.enabled.peek()) {
				video.muted = true;
				this.#signals.effect((effect) => {
					video.muted = !effect.get(this.#parent.enabled);
				});
			}

			video.autoplay = true;
			video.load();
			video.play();
			return { element: video, source: videoSource };
		}

		if (audioSource) {
			const audio = new Audio(new URL(`/meme/${audioSource.file}`, import.meta.env.VITE_APP_URL).toString());
			audio.autoplay = true;
			audio.muted = !this.#parent.enabled.peek();
			this.#signals.effect((effect) => {
				audio.muted = !effect.get(this.#parent.enabled);
			});
			audio.load();
			return { element: audio, source: audioSource };
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
