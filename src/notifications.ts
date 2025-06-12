import { signal, Signal, Signals } from "@kixelated/signals";

const SOUNDS = {
	bup: "/audio/bup.opus",
	bye: "/audio/bye.opus",
	chat: ["/audio/chat1.opus", "/audio/chat2.opus", "/audio/chat3.opus", "/audio/chat4.opus", "/audio/chat5.opus"],
	select: "/audio/select.opus",
	sup: "/audio/sup.opus",
} as const;

export type SoundName = keyof typeof SOUNDS;

export interface NotificationsProps {
	volume: Signal<number>;
	muted: Signal<boolean>;
}

export class Notifications {
	ctx: AudioContext;
	gain: GainNode;

	#sounds: Map<SoundName, Promise<AudioBuffer[]>>;
	#signals = new Signals();

	constructor(props: NotificationsProps) {
		this.ctx = new AudioContext();
		this.gain = new GainNode(this.ctx);
		this.gain.connect(this.ctx.destination);

		this.#signals.effect(() => {
			// Reduce the volume for notifications so we can hear them over everything else.
			this.gain.gain.value = props.muted.get() ? 0 : props.volume.get() / 2;
		});

		const sounds = new Map();

		for (const [sound, url] of Object.entries(SOUNDS)) {
			const urls = Array.isArray(url) ? url : [url];
			const load = Promise.all(
				urls.map(async (url) => {
					const response = await fetch(url);
					const data = await response.arrayBuffer();
					return await this.ctx.decodeAudioData(data);
				}),
			);
			sounds.set(sound, load);
		}

		this.#sounds = sounds;
	}

	get suspended() {
		return this.ctx.state === "suspended";
	}

	// Return a buffer for the sound, randomly selecting one if there are multiple.
	async load(sound: SoundName): Promise<AudioBuffer> {
		const buffers = await this.#sounds.get(sound);
		if (!buffers) throw new Error(`Sound "${String(sound)}" not loaded`);
		return buffers[Math.floor(Math.random() * buffers.length)];
	}

	async play(sound: SoundName) {
		const buffer = await this.load(sound);
		const source = new AudioBufferSourceNode(this.ctx, { buffer });
		source.connect(this.ctx.destination);
		source.start();
	}

	resume() {
		this.ctx.resume();
	}

	broadcast(): BroadcastNotifications {
		return new BroadcastNotifications(this);
	}

	close() {
		this.ctx.close();
		this.gain.disconnect();
		this.#signals.close();
	}
}

export class BroadcastNotificationsProps {
	pan?: number;
}

export class BroadcastNotifications {
	#parent: Notifications;
	#panner: StereoPannerNode;

	pan: Signal<number>;

	#signals = new Signals();

	constructor(parent: Notifications, props?: BroadcastNotificationsProps) {
		this.#parent = parent;
		this.#panner = new StereoPannerNode(parent.ctx, { pan: props?.pan ?? 0 });
		this.#panner.connect(parent.gain);

		this.pan = signal(props?.pan ?? 0);

		this.#signals.effect(() => {
			this.#panner.pan.value = this.pan.get();
		});
	}

	async play(sound: SoundName) {
		const buffer = await this.#parent.load(sound);
		const source = new AudioBufferSourceNode(this.#parent.ctx, { buffer });
		source.connect(this.#panner);

		// TODO: For some reason, sounds don't play correctly on startup.
		// Add a 200ms delay for startup only, abusing that currentTime starts at 0.
		const when = Math.max(this.#parent.ctx.currentTime, 0.2);
		source.start(when);
	}

	close() {
		this.#signals.close();
		this.#panner.disconnect();
	}
}
