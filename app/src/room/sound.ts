import { Effect, Signal } from "@moq/signals";
import Settings from "../settings";

import { TTS } from "./tts";

const NOTIFICATIONS = {
	bup: "/notification/bup.opus",
	chat: [
		"/notification/chat1.opus",
		"/notification/chat2.opus",
		"/notification/chat3.opus",
		"/notification/chat4.opus",
		"/notification/chat5.opus",
	],
	select: "/notification/select.opus",
} as const;

export type NotificationSound = keyof typeof NOTIFICATIONS;
export const FADE_TIME = 0.2;

/**
 * Fade `param` linearly from its current value to `value`, cancelling any fade in progress.
 *
 * An exponential ramp cannot start or end at silence, so muting and unmuting use a linear one.
 */
export function fade(param: AudioParam, value: number, context: BaseAudioContext) {
	const now = context.currentTime;
	param.cancelScheduledValues(now);
	param.setValueAtTime(param.value, now);
	param.linearRampToValueAtTime(value, now + FADE_TIME);
}

export type SoundProps = {
	enabled?: boolean | Signal<boolean>;
};

const RESUME_EVENTS = ["click", "touchstart", "touchend", "mousedown", "keydown"];

export class Sound {
	enabled: Signal<boolean>;
	tts: TTS;

	context: AudioContext;
	gain: GainNode;
	suspended: Signal<boolean>;

	// Loaded on first use, so a Sound that never notifies never fetches them.
	#notifications = new Map<NotificationSound, Promise<AudioBuffer[]>>();
	#signals = new Effect();

	constructor(props?: SoundProps) {
		this.context = new AudioContext({
			latencyHint: "playback",
		});
		this.suspended = new Signal(this.context.state === "suspended");

		// Try to initialize the audio context if it's suspended.
		if (this.suspended.peek()) {
			// Listen for any events that might let us unmute the audio context.
			for (const event of RESUME_EVENTS) {
				document.addEventListener(
					event,
					() => this.context.resume().then(() => this.suspended.set(this.context.state === "suspended")),
					{ once: true },
				);
			}
		}

		this.enabled = Signal.from(props?.enabled ?? false);

		this.gain = new GainNode(this.context);
		this.gain.connect(this.context.destination);
		this.tts = new TTS(this);

		this.#signals.run(this.#runGain.bind(this));
	}

	#runGain(effect: Effect) {
		// Reduce the volume for notifications so we can hear them over everything else.
		const volume = effect.get(this.enabled) ? effect.get(Settings.audio.volume) / 2 : 0;
		fade(this.gain.gain, volume, this.context);
	}

	// Return a buffer for the sound, randomly selecting one if there are multiple.
	async notificationNode(sound: NotificationSound): Promise<AudioBufferSourceNode> {
		let load = this.#notifications.get(sound);
		if (!load) {
			const url = NOTIFICATIONS[sound];
			const urls: readonly string[] = typeof url === "string" ? [url] : url;
			load = Promise.all(urls.map((url) => this.load(url)));
			this.#notifications.set(sound, load);
		}

		const buffers = await load;
		const buffer = buffers[Math.floor(Math.random() * buffers.length)];
		return new AudioBufferSourceNode(this.context, { buffer });
	}

	async notification(sound: NotificationSound) {
		if (this.suspended.peek()) return;

		const source = await this.notificationNode(sound);
		source.connect(this.gain);
		source.start();
	}

	media(element: HTMLAudioElement | HTMLVideoElement): MediaElementAudioSourceNode {
		const source = new MediaElementAudioSourceNode(this.context, { mediaElement: element });
		source.connect(this.gain);
		return source;
	}

	async load(url: string): Promise<AudioBuffer> {
		const response = await fetch(url);
		const data = await response.arrayBuffer();
		return await this.context.decodeAudioData(data);
	}

	close() {
		this.context.close().catch(() => {});
		this.gain.disconnect();
		this.tts.close();
		this.#signals.close();
	}
}

export class PannedSound {
	parent: Sound;
	#panner: StereoPannerNode;

	analyser: AnalyserNode;
	#buffer = new Uint8Array(1024);

	pan: Signal<number>;

	#signals = new Effect();

	constructor(parent: Sound, pan: Signal<number>) {
		this.parent = parent;

		this.#panner = new StereoPannerNode(parent.context);
		this.#panner.connect(parent.gain);

		this.pan = pan;

		this.analyser = new AnalyserNode(this.parent.context, { fftSize: this.#buffer.length });
		this.#panner.connect(this.analyser);

		this.#signals.run((effect) => {
			effect.cleanup(() => this.#panner.pan.cancelScheduledValues(this.#panner.context.currentTime));

			const pan = Math.max(-1, Math.min(1, effect.get(this.pan) * 2));
			this.#panner.pan.linearRampToValueAtTime(pan, this.#panner.context.currentTime + FADE_TIME);
		});
	}

	async notification(sound: NotificationSound) {
		if (this.parent.suspended.peek()) return;

		const source = await this.parent.notificationNode(sound);
		source.connect(this.#panner);

		// TODO: For some reason, sounds don't play correctly on startup.
		// Add a 200ms delay for startup only, abusing that currentTime starts at 0.
		const when = Math.max(this.parent.context.currentTime, 0.2);
		source.start(when);
	}

	media(element: HTMLAudioElement | HTMLVideoElement): MediaElementAudioSourceNode {
		const source = new MediaElementAudioSourceNode(this.parent.context, { mediaElement: element });
		source.connect(this.#panner);
		return source;
	}

	/** Play a buffer from {@link Sound.load} through this panner. */
	play(buffer: AudioBuffer): AudioBufferSourceNode {
		const node = new AudioBufferSourceNode(this.parent.context, { buffer });
		node.connect(this.#panner);
		node.start();
		return node;
	}

	// NOTE: The buffer is reused, so don't hold on to it.
	analyze(): Uint8Array {
		this.analyser.getByteTimeDomainData(this.#buffer);
		return this.#buffer;
	}

	close() {
		this.#signals.close();
		this.#panner.disconnect();
		this.analyser.disconnect();
	}
}
