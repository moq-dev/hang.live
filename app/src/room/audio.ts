import { Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import { PannedNotifications as PannedSound, Sound } from "./sound";

const FADE_TIME = 0.2;
const GAIN_MIN = 0.001;

export type AudioProps = {
	sound?: Sound;
	pan?: number;
};

export type AudioSource = Watch.Audio | Publish.Audio;

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
			// Don't analyze the audio in potato mode.
			// TODO I'm just assuming this is slow. Use SIMD?
			if (effect.get(Settings.potato)) return;

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

			const volume = effect.get(Settings.muted) ? 0 : effect.get(Settings.volume);

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
			if (this.broadcast.source instanceof Publish.Broadcast) {
				const speaking = effect.get(this.broadcast.source.audio.speaking);
				this.#speaking = speaking ?? false;
			}
		});
	}

	#runOutput(effect: Effect) {
		const root = effect.get(this.broadcast.source.audio.root);
		if (!root) return;

		const gain = new GainNode(root.context, { gain: Settings.volume.peek() });
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

	renderBackground(ctx: CanvasRenderingContext2D) {
		if (Settings.potato.peek()) return;

		ctx.save();

		const bounds = this.broadcast.bounds.peek();

		ctx.translate(bounds.position.x, bounds.position.y);

		const RADIUS = 8 + 16 * Math.sqrt(this.broadcast.scale);
		const PADDING = 8 + 16 * Math.sqrt(this.broadcast.scale);

		// Background outline
		ctx.beginPath();
		this.#roundedRectPath(
			ctx,
			-PADDING,
			-PADDING,
			bounds.size.x + PADDING * 2,
			bounds.size.y + PADDING * 2,
			RADIUS,
		);
		ctx.fillStyle = "#000";
		ctx.fill();

		ctx.restore();
	}

	render(ctx: CanvasRenderingContext2D) {
		// Compute average volume
		const analyserBuffer = this.sound.analyze();
		if (!analyserBuffer) return; // undefined in potato mode

		const bounds = this.broadcast.bounds.peek();
		const scale = this.broadcast.scale;

		ctx.save();
		ctx.translate(bounds.position.x, bounds.position.y);

		const PADDING = 8 + 16 * Math.sqrt(scale);
		const RADIUS = 8 + 16 * Math.sqrt(scale);

		// Take the absolute value of the distance from 128, which is silence.
		for (let i = 0; i < this.#analyserBuffer.length; i++) {
			analyserBuffer[i] = Math.abs(analyserBuffer[i] - 128);
		}

		// If the audio is playing, combine the buffers.
		if (this.#analyser) {
			if (this.#analyserBuffer.length !== analyserBuffer.length) {
				throw new Error("analyser buffer length mismatch");
			}

			this.#analyser.getByteTimeDomainData(this.#analyserBuffer);
			for (let i = 0; i < this.#analyserBuffer.length; i++) {
				analyserBuffer[i] += Math.abs(this.#analyserBuffer[i] - 128);
			}
		}

		let sum = 0;
		for (let i = 0; i < this.#analyserBuffer.length; i++) {
			const sample = analyserBuffer[i];
			sum += sample * sample;
		}
		const volume = Math.sqrt(sum) / this.#analyserBuffer.length;
		this.#volumeSmoothed = this.#volumeSmoothed * 0.7 + volume * 0.3;

		// Colored fill based on volume and speaking state
		const expand = PADDING * Math.min(1, this.#volumeSmoothed - 0.01);

		ctx.beginPath();
		this.#roundedRectPath(ctx, -expand, -expand, bounds.size.x + expand * 2, bounds.size.y + expand * 2, RADIUS);

		const hue = 180 + this.#volumeSmoothed * 120;
		const alpha = 0.3 + this.#volumeSmoothed * 0.4;

		ctx.fillStyle = `hsla(${hue}, 80%, 45%, ${alpha})`;
		ctx.fill();

		// Ramp up/down the speaking alpha based on the speaking state.
		this.#speakingAlpha = Math.max(Math.min(1, this.#speakingAlpha + (this.#speaking ? 0.1 : -0.1)), 0);

		// Add an additional border if we're speaking, ramping up/down the alpha
		if (this.#speakingAlpha > 0) {
			ctx.strokeStyle = `hsla(${hue}, 80%, 45%, ${this.#speakingAlpha})`;
			ctx.lineWidth = 6 * this.broadcast.scale;
			ctx.stroke();
		}

		ctx.restore();
	}

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
	}
}
