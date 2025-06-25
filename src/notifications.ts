import { type Effect, Root, type Signal } from "@kixelated/signals";
import Settings from "./settings";

const SOUNDS = {
	bup: "/notification/bup.opus",
	bye: "/notification/bye.opus",
	chat: [
		"/notification/chat1.opus",
		"/notification/chat2.opus",
		"/notification/chat3.opus",
		"/notification/chat4.opus",
		"/notification/chat5.opus",
	],
	select: "/notification/select.opus",
	sup: "/notification/sup.opus",
} as const;

export type NotificationSound = keyof typeof SOUNDS;
const FADE_TIME = 0.2;
const GAIN_MIN = 0.001;

export class Notifications {
	context: AudioContext;
	gain: GainNode;

	#sounds: Map<NotificationSound, Promise<AudioBuffer[]>>;
	#signals = new Root();

	constructor() {
		this.context = new AudioContext();
		this.gain = new GainNode(this.context);
		this.gain.connect(this.context.destination);

		const sounds = new Map();

		for (const [sound, url] of Object.entries(SOUNDS)) {
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

	get suspended() {
		return this.context.state === "suspended";
	}

	// Return a buffer for the sound, randomly selecting one if there are multiple.
	async load(sound: NotificationSound): Promise<AudioBuffer> {
		const buffers = await this.#sounds.get(sound);
		if (!buffers) throw new Error(`Sound "${String(sound)}" not loaded`);
		return buffers[Math.floor(Math.random() * buffers.length)];
	}

	async play(sound: NotificationSound) {
		const buffer = await this.load(sound);
		const source = new AudioBufferSourceNode(this.context, { buffer });
		source.connect(this.context.destination);
		source.start();
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
	#parent: Notifications;
	#panner: StereoPannerNode;

	// Optional, disabled in potato mode.
	analyser?: AnalyserNode;
	#buffer = new Uint8Array(1024);

	pan: Signal<number>;

	#signals = new Root();

	constructor(parent: Notifications, pan: Signal<number>) {
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

			const pan = effect.get(Settings.headphones) ? Math.max(-1, Math.min(1, effect.get(this.pan) * 2)) : 0;
			this.#panner.pan.linearRampToValueAtTime(pan, this.#panner.context.currentTime + FADE_TIME);
		});
	}

	async play(sound: NotificationSound) {
		const buffer = await this.#parent.load(sound);
		const source = new AudioBufferSourceNode(this.#parent.context, { buffer });
		source.connect(this.#panner);

		// TODO: For some reason, sounds don't play correctly on startup.
		// Add a 200ms delay for startup only, abusing that currentTime starts at 0.
		const when = Math.max(this.#parent.context.currentTime, 0.2);
		source.start(when);
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
