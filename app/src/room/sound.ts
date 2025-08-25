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

// Weighted join announcements with varying rarity
const JOIN_ANNOUNCEMENTS = [
	// Common (70% chance total)
	{ text: "{name} joined.", weight: 20 },
	{ text: "Sup {name}.", weight: 15 },
	{ text: "{name} is here.", weight: 10 },
	{ text: "What's up {name}?", weight: 10 },
	{ text: "Yo {name}.", weight: 10 },
	{ text: "{name} has entered.", weight: 8 },
	{ text: "Welcome {name}.", weight: 7 },

	// Uncommon (20% chance total)
	{ text: "{name} has arrived.", weight: 4 },
	{ text: "{name} rolled up.", weight: 3 },
	{ text: "{name} showed up.", weight: 3 },
	{ text: "{name} slid in.", weight: 2.5 },
	{ text: "{name} just dropped.", weight: 2.5 },
	{ text: "Look who it is, {name}.", weight: 2 },
	{ text: "{name} in the building.", weight: 2 },
	{ text: "{name} has graced us.", weight: 1 },

	// Rare (8% chance total)
	{ text: "Behold, {name} approaches.", weight: 1.5 },
	{ text: "{name} has manifested.", weight: 1.5 },
	{ text: "Alert: {name} detected.", weight: 1 },
	{ text: "{name} teleported in.", weight: 1 },
	{ text: "A wild {name} appeared.", weight: 1 },
	{ text: "{name} spawned", weight: 1 },
	{ text: "{name} has entered the chat.", weight: 0.5 },
	{ text: "Everybody act normal, {name} is here.", weight: 0.5 },

	// Ultra-rare (2% chance total)
	{ text: "Praise be, the lord and savior {name} has graced us with their presence.", weight: 0.3 },
	{ text: "Ladies and gentlemen, we got {name} here.", weight: 0.3 },
	{ text: "Stop everything, {name} has blessed us with their divine presence.", weight: 0.2 },
	{ text: "Breaking news: {name} has been spotted in the vicinity.", weight: 0.2 },
	{ text: "The prophecy foretold of {name}'s arrival.", weight: 0.2 },
	{ text: "Historians will mark this moment: {name} has joined.", weight: 0.2 },
	{ text: "The legends spoke of this day when {name} would join us.", weight: 0.15 },
	{ text: "Sound the horns, {name} has arrived at the gates.", weight: 0.15 },
	{ text: "By the ancient laws, we welcome {name} to our realm.", weight: 0.1 },
	{ text: "The stars have aligned to bring us {name}.", weight: 0.1 },
	{
		text: "From the Ghastly Eyrie I can see to the ends of the world, and from this vantage point I declare with utter certainty that {name} has joined the hang!",
		weight: 0.01,
	},
] as const;

const JOIN_ANNOUNCEMENTS_WEIGHT = JOIN_ANNOUNCEMENTS.reduce((sum, item) => sum + item.weight, 0);

// Weighted leave announcements with varying rarity
const LEAVE_ANNOUNCEMENTS = [
	// Common (70% chance total)
	{ text: "{name} has left.", weight: 20 },
	{ text: "{name} left.", weight: 15 },
	{ text: "Bye {name}.", weight: 10 },
	{ text: "{name} is gone.", weight: 8 },
	{ text: "{name} disconnected.", weight: 7 },
	{ text: "See ya {name}.", weight: 5 },
	{ text: "{name} dipped.", weight: 5 },

	// Uncommon (20% chance total)
	{ text: "{name} peaced out.", weight: 3 },
	{ text: "{name} bounced.", weight: 3 },
	{ text: "{name} vanished.", weight: 2.5 },
	{ text: "{name} has departed.", weight: 2 },
	{ text: "{name} ghosted.", weight: 2 },
	{ text: "{name} rage quit.", weight: 2 },
	{ text: "{name} went to get milk.", weight: 1.5 },
	{ text: "{name} has abandoned us.", weight: 1.5 },
	{ text: "{name} evaporated.", weight: 1.5 },

	// Rare (8% chance total)
	{ text: "{name} died.", weight: 1.5 },
	{ text: "{name} got thanos snapped.", weight: 1 },
	{ text: "{name} returned to the void.", weight: 1 },
	{ text: "{name} has been yeeted from existence.", weight: 1 },
	{ text: "{name} faded away.", weight: 0.8 },
	{ text: "Press F to pay respects, {name} is gone.", weight: 0.8 },
	{ text: "{name} has left the chat.", weight: 0.5 },
	{ text: "{name} went poof.", weight: 0.5 },
	{ text: "{name} disconnected from the matrix.", weight: 0.5 },
	{ text: "{name} was recalled to headquarters.", weight: 0.4 },

	// Ultra-rare (2% chance total)
	{ text: "The universe is a sadder place now that {name} has left.", weight: 0.3 },
	{ text: "And thus {name} departed, never to be seen again... probably.", weight: 0.25 },
	{ text: "{name} has ascended to a higher plane of existence.", weight: 0.2 },
	{ text: "Historians will note the tragic departure of {name}.", weight: 0.2 },
	{ text: "With a heavy heart, we bid farewell to {name}.", weight: 0.2 },
	{ text: "The prophecy has been fulfilled, {name} has left us.", weight: 0.15 },
	{ text: "{name} has been banished to the shadow realm.", weight: 0.15 },
	{ text: "Legends say {name} will return... but not today.", weight: 0.15 },
	{ text: "As foretold by the ancients, {name} has departed.", weight: 0.1 },
	{ text: "The void calls, and {name} must answer.", weight: 0.1 },
	{ text: "{name} has gone where no one can follow.", weight: 0.1 },
	{ text: "{name} has been sent to the void.", weight: 0.1 },
	{
		text: "From the Ghastly Eyrie I can see to the ends of the world, and from this vantage point I declare with utter certainty that {name} has left the hang!",
		weight: 0.01,
	},
];

const LEAVE_ANNOUNCEMENTS_WEIGHT = LEAVE_ANNOUNCEMENTS.reduce((sum, item) => sum + item.weight, 0);

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

	async joined(name: string) {
		const random = Math.random() * JOIN_ANNOUNCEMENTS_WEIGHT;
		let accumulated = 0;

		let text = `${name} joined`;
		for (const announcement of JOIN_ANNOUNCEMENTS) {
			accumulated += announcement.weight;
			if (random <= accumulated) {
				text = announcement.text.replace("{name}", name);
				break;
			}
		}

		await this.say(text);
	}

	async left(name: string) {
		const random = Math.random() * LEAVE_ANNOUNCEMENTS_WEIGHT;
		let accumulated = 0;

		let text = `${name} left`;
		for (const announcement of LEAVE_ANNOUNCEMENTS) {
			accumulated += announcement.weight;
			if (random <= accumulated) {
				text = announcement.text.replace("{name}", name);
				break;
			}
		}

		await this.say(text);
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
