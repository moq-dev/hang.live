import { Effect, Signal } from "@kixelated/signals";
import * as Comlink from "comlink";
import Settings from "../settings";

import type { SoundWorker, Voice } from "./worker/sound";

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

export class Sound {
	context: AudioContext;
	gain: GainNode;

	#sounds: Map<NotificationSound, Promise<AudioBuffer[]>>;
	#signals = new Effect();

	#worker: Comlink.Remote<SoundWorker> | undefined;

	suspended: Signal<boolean>;

	constructor() {
		this.context = new AudioContext();
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

		if (this.suspended.peek()) {
			// Determine when the user has interacted with the page so we can potentially unmute audio.
			const unsuspend = () => {
				this.suspended.set(false);
				this.context.resume();
			};

			this.#signals.eventListener(window, "click", unsuspend, { once: true });
			this.#signals.eventListener(window, "keydown", unsuspend, { once: true });
		}

		this.#signals.effect((effect) => {
			// Only start loading the TTS model when the context is unsuspended.
			// This is kind of a hack to avoid it when the demo is loaded before interaction.
			if (effect.get(this.suspended)) return;

			const worker = new Worker(new URL("./worker/sound", import.meta.url), { type: "module" });
			effect.cleanup(() => worker.terminate());

			const workerApi = Comlink.wrap<SoundWorker>(worker);

			this.#worker = workerApi;
			effect.cleanup(() => {
				this.#worker = undefined;
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
		// Can't play sounds when the context is suspended, and we don't want to queue them either.
		if (this.context.state === "suspended") return;

		const buffer = await this.load(sound);
		const source = new AudioBufferSourceNode(this.context, { buffer });
		source.connect(this.context.destination);
		source.start();
	}

	async say(text: string, voice: Voice = "af_sky") {
		if (!this.#worker) return;

		// Give the worker at most 2s to load the model before timing out.
		const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
		const ready = await Promise.race([this.#worker.ready().then(() => true), timeout]);

		if (!ready) {
			console.warn("TTS worker timed out");
			return;
		}

		const audioUrl = await this.#worker.tts(text, voice);

		// Fetch the audio from the object URL
		const response = await fetch(audioUrl);
		const arrayBuffer = await response.arrayBuffer();
		const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

		// Play the audio through the panner
		const source = new AudioBufferSourceNode(this.context, { buffer: audioBuffer });
		source.connect(this.context.destination);
		source.start();

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

		// Only create the analyser if we're not in potato mode.
		this.#signals.effect((effect) => {
			if (effect.get(Settings.potato)) return;

			const analyser = new AnalyserNode(this.#parent.context, { fftSize: this.#buffer.length });
			this.#panner.connect(analyser);

			this.analyser = analyser;

			effect.cleanup(() => {
				analyser.disconnect();
				this.analyser = undefined;
			});
		});

		this.#signals.effect((effect) => {
			effect.cleanup(() => this.#panner.pan.cancelScheduledValues(this.#panner.context.currentTime));

			const pan = Math.max(-1, Math.min(1, effect.get(this.pan) * 2));
			this.#panner.pan.linearRampToValueAtTime(pan, this.#panner.context.currentTime + FADE_TIME);
		});
	}

	async notification(sound: NotificationSound) {
		// Can't play sounds when the context is suspended, and we don't want to queue them either.
		if (this.#parent.context.state === "suspended") return;

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
		// Make the name lowercase.
		const lower = name.toLowerCase();

		const videoPath = MEME_VIDEO[lower as MemeVideo];
		const audioPath = MEME_AUDIO[lower as MemeAudio];

		// Use the video if it's available, unless the user has potato mode enabled and would prefer audio.
		if (videoPath && (!audioPath || !Settings.potato.peek())) {
			const video = document.createElement("video") as HTMLVideoElement;
			video.src = `/meme/${videoPath}`;

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

		if (audioPath) {
			const audio = new Audio(`/meme/${audioPath}`);
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

const MEME_AUDIO = {
	amongus: "among-us.mp3",
	aww: "aww.mp3",
	brb: "be-right-back.mp3",
	bluetooth: "bluetooth.mp3",
	bonk: "bonk.mp3",
	bruh: "bruh.mp3",
	checkmark: "check-mark.mp3",
	checkout: "checkout.mp3",
	danger: "danger.mp3",
	disappear: "disappear.mp3",
	discord: "discord.mp3",
	error: "error.mp3",
	fbi: "fbi.mp3",
	fart: "fart-reverb.mp3",
	hellothere: "hello-there.mp3",
	hub: "hub-intro.mp3",
	huh: "huh.mp3",
	incorrect: "incorrect.mp3",
	knock: "knock.mp3",
	meow: "meow.mp3",
	metalpipe: "metal-pipe.mp3",
	mlg: "mlg.mp3",
	nut: "nut.mp3",
	oof: "oof.mp3",
	piuw: "piuw.mp3",
	ps2: "ps2.mp3",
	quack: "quack.mp3",
	rizz: "rizz.mp3",
	spooky: "spooky.mp3",
	suspense: "suspense.mp3",
	uwu: "uwu.mp3",
	violin: "violin.mp3",
	boom: "boom.mp3",
	wow: "wow.mp3",
	yay: "yay.mp3",
} as const;

const MEME_VIDEO = {
	anotherone: "another-one.webm",
	momentslater: "a-few-moments-later.mp4",
	// TODO contain, not fill
	brb: "be-right-back.webm",
	// TODO: align to bottom left, make sure top is filled
	bingchilling: "bing-chilling.webm",
	cry: "crying.webm",
	gettingawaywithit: "getting-away-with-it.webm",
	disappointment: "disappointment.webm",
	hellothere: "hello-there.webm",
	// TODO: stretch to contain, not fit
	hackerman: "hackerman.webm",
	awwshit: "aww-shit.webm",
	error: "error.webm",
	huh: "huh.webm",
	kek: "kekw.webm",
	instagram: "instagram.webm",
	maxwell: "maxwell.webm",
	nice: "nice.webm",
	oiia: "oiia.webm",
	nogodno: "no-god-no.webm",
	// TODO stretch to contain, not fit (or align to bottom left)
	continued: "continued.webm",
	reformed: "reformed.webm",
	doit: "do-it.webm",
	thick: "thick.webm",
	yeahbaby: "yeah-baby.webm",
	thuglife: "thug-life.webm",
	gigachad: "giga-chad.webm",
	okay: "okay.webm",

	// TODO: It should go over the screenshare, not the webcam, and should be in the top right corner.
	// speedrun: "speedrun.webm",
	pizzatime: "pizza-time.webm",
	stopit: "stopit.webm",
	youdied: "you-died.webm",
	realestate: "real-estate.webm",
	waw: "waw.webm",
	zzz: "zzz.webm",
} as const;

export type MemeAudio = keyof typeof MEME_AUDIO;
export type MemeVideo = keyof typeof MEME_VIDEO;
