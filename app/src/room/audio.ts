import { Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import { PannedNotifications as PannedSound, Sound } from "./sound";

const FADE_TIME = 0.2;
const GAIN_MIN = 0.001;

export type AudioProps = {
	pan?: number;
};

export type AudioSource = Watch.Audio.Source | Publish.Audio.Encoder;

export class Audio {
	broadcast: Broadcast;
	pan: Signal<number>;

	#analyser?: AnalyserNode;
	#analyserBuffer = new Uint8Array(1024);

	#gain = new Signal<GainNode | undefined>(undefined);
	#panner = new Signal<StereoPannerNode | undefined>(undefined);

	// We use a different AudioContext for notifications, so we need a separate analyser.
	// TODO reuse if the sample rate is the same?
	sound: PannedSound;

	#volumeSmoothed = 0;

	#speaking = false;
	#speakingAlpha = 0;

	#signals = new Effect();

	constructor(broadcast: Broadcast, sound: Sound, props?: AudioProps) {
		this.broadcast = broadcast;
		this.pan = new Signal(props?.pan ?? 0);

		this.sound = new PannedSound(sound, this.pan);

		this.#signals.effect((effect) => {
			const meme = effect.get(this.broadcast.meme);
			if (!meme) return;

			const source = new MediaElementAudioSourceNode(this.sound.context, { mediaElement: meme });

			// Use the existing notifications context so we don't need to create our own panner/volume.
			this.sound.connect(source);
			effect.cleanup(() => source.disconnect());
		});

		this.#signals.effect((effect) => {
			const root = effect.get(this.broadcast.source.audio.root);
			if (!root) return;

			// We analyze the audio to get the volume before gain/pan.
			// NOTE: fftSize is always twice the buffer length.
			const analyser = new AnalyserNode(root.context, { fftSize: 2 * this.#analyserBuffer.length });
			this.#analyser = analyser;
			root.connect(analyser);

			effect.cleanup(() => {
				analyser.disconnect();
				this.#analyser = undefined;
			});
		});

		this.#signals.effect((effect) => {
			const panner = effect.get(this.#panner);
			if (!panner) return;

			effect.cleanup(() => panner.pan.cancelScheduledValues(panner.context.currentTime));

			const pan = Math.max(-1, Math.min(1, effect.get(this.pan)));
			panner.pan.linearRampToValueAtTime(pan, panner.context.currentTime + FADE_TIME);
		});

		this.#signals.effect((effect) => {
			const gain = effect.get(this.#gain);
			if (!gain) return;

			// Cancel any scheduled transitions on change.
			effect.cleanup(() => gain.gain.cancelScheduledValues(gain.context.currentTime));

			const volume = effect.get(Settings.audio.muted) ? 0 : effect.get(Settings.audio.volume);

			if (volume < GAIN_MIN) {
				gain.gain.exponentialRampToValueAtTime(GAIN_MIN, gain.context.currentTime + FADE_TIME);
				gain.gain.setValueAtTime(0, gain.context.currentTime + FADE_TIME + 0.01);
			} else {
				gain.gain.exponentialRampToValueAtTime(volume, gain.context.currentTime + FADE_TIME);
			}
		});

		// Don't output to the speakers if we're publishing the broadcast.
		if (!(this.broadcast.source instanceof Publish.Broadcast)) {
			this.#signals.effect(this.#runOutput.bind(this));
		}

		// Track speaking state from publish broadcast
		this.#signals.effect((effect) => {
			const speaking = effect.get(this.broadcast.source.audio.speaking.active);
			this.#speaking = speaking ?? false;
		});
	}

	#runOutput(effect: Effect) {
		const root = effect.get(this.broadcast.source.audio.root);
		if (!root) return;

		const gain = new GainNode(root.context, { gain: Settings.audio.volume.peek() });
		effect.cleanup(() => gain.disconnect());

		this.#gain.set(gain);
		effect.cleanup(() => this.#gain.set(undefined));

		root.connect(gain);

		if (root.channelCount > 1) {
			const audioPanner = new StereoPannerNode(root.context, {
				channelCount: root.channelCount,
			});
			effect.cleanup(() => audioPanner.disconnect());

			this.#panner.set(audioPanner);
			effect.cleanup(() => this.#panner.set(undefined));

			gain.connect(audioPanner);
			audioPanner.connect(root.context.destination);
		} else {
			gain.connect(root.context.destination);
		}
	}

	// TODO: Audio visualization will be implemented with WebGL shaders
	// renderBackground(ctx: CanvasRenderingContext2D) {
	// 	// Black background outline
	// }

	// render(ctx: CanvasRenderingContext2D) {
	// 	// Audio visualization with colored fill based on volume
	// }

	#roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		const maxR = Math.min(r, w / 2, h / 2);
		ctx.moveTo(x + maxR, y);
		ctx.lineTo(x + w - maxR, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + maxR);
		ctx.lineTo(x + w, y + h - maxR);
		ctx.quadraticCurveTo(x + w, y + h, x + w - maxR, y + h);
		ctx.lineTo(x + maxR, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - maxR);
		ctx.lineTo(x, y + maxR);
		ctx.quadraticCurveTo(x, y, x + maxR, y);
	}

	close() {
		this.#signals.close();
		this.sound.close();
	}
}
