import { Publish, Watch } from "@kixelated/hang";
import { Signal, Root, Effect } from "@kixelated/signals";
import { Broadcast } from "./broadcast";
import { Notifications, PannedNotifications } from "./notifications";
import Settings from "./settings";

export type AudioProps = {
	notifications: Notifications;
	muted: Signal<boolean>;
	volume: Signal<number>;

	pan?: number;
};

export type AudioSource = Watch.Audio | Publish.Audio;

export class Audio {
	broadcast: Broadcast;
	muted: Signal<boolean>;
	volume: Signal<number>;
	pan: Signal<number>;

	#analyser?: AnalyserNode;
	#analyserBuffer = new Uint8Array(1024);

	#gain = new Signal<GainNode | undefined>(undefined);
	#panner = new Signal<StereoPannerNode | undefined>(undefined);

	// We use a different AudioContext for notifications, so we need a separate analyser.
	// TODO reuse if the sample rate is the same?
	notifications: PannedNotifications;

	#volumeSmoothed = 0;

	#signals = new Root();

	constructor(broadcast: Broadcast, props: AudioProps) {
		this.broadcast = broadcast;
		this.muted = props.muted;
		this.volume = props.volume;
		this.pan = new Signal(props?.pan ?? 0);

		this.notifications = new PannedNotifications(props.notifications, this.pan);

		this.#signals.effect((effect) => {
			const meme = effect.get(this.broadcast.meme);
			if (!meme) return;

			const source = new MediaElementAudioSourceNode(this.notifications.context, { mediaElement: meme });

			// Use the existing notifications context so we don't need to create our own panner/volume.
			this.notifications.connect(source);
			effect.cleanup(() => source.disconnect());
		});

		this.#signals.effect((effect) => {
			// Don't analyze the audio in potato mode.
			// TODO I'm just assuming this is slow. Use SIMD?
			if (effect.get(Settings.potato)) return;

			const root = effect.get(this.broadcast.source.audio.root);
			console.log("root", root);
			if (!root) return;

			// We analyze the audio to get the volume before gain/pan.
			const analyser = new AnalyserNode(root.context, { fftSize: this.#analyserBuffer.length });
			this.#analyser = analyser;
			root.connect(analyser);

			effect.cleanup(() => {
				console.log("disconnecting analyser");
				analyser.disconnect();
				this.#analyser = undefined;
			});
		});

		this.#signals.effect((effect) => {
			const panner = effect.get(this.#panner);
			if (!panner) return;

			const pan = effect.get(this.pan);
			panner.pan.value = Math.max(-1, Math.min(1, pan * 2));
		});

		this.#signals.effect((effect) => {
			const gain = effect.get(this.#gain);
			if (!gain) return;

			gain.gain.value = effect.get(this.muted) ? 0 : effect.get(this.volume);
		});

		this.#signals.effect(this.#init.bind(this));
	}

	#init(effect: Effect) {
		const root = effect.get(this.broadcast.source.audio.root);
		if (!root) return;

		const gain = new GainNode(root.context, { gain: this.volume.peek() });
		effect.cleanup(() => gain.disconnect());

		this.#gain.set(gain);
		effect.cleanup(() => this.#gain.set(undefined));

		root.connect(gain);

		if (root.channelCount < 2) {
			gain.connect(root.context.destination); // output to the speakers
			return;
		}

		if (effect.get(Settings.pan)) {
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

		const cornerRadius = 32 * this.broadcast.scale;
		const PADDING = 32;

		// Background outline
		ctx.beginPath();
		this.#roundedRectPath(
			ctx,
			-PADDING,
			-PADDING,
			bounds.size.x + PADDING * 2,
			bounds.size.y + PADDING * 2,
			cornerRadius,
		);
		ctx.fillStyle = "#000";
		ctx.fill();
		ctx.restore();
	}

	render(ctx: CanvasRenderingContext2D) {
		// Compute average volume
		const analyserBuffer = this.notifications.analyze();
		if (!analyserBuffer) return; // undefined in potato mode

		const bounds = this.broadcast.bounds.peek();
		const scale = this.broadcast.scale;

		ctx.save();
		ctx.translate(bounds.position.x, bounds.position.y);

		const cornerRadius = 32 * scale;
		const fillAlphaBase = 0.3;
		const PADDING = 32;

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
		const volume = (2 * Math.sqrt(sum)) / this.#analyserBuffer.length;
		this.#volumeSmoothed = this.#volumeSmoothed * 0.7 + volume * 0.3;

		// Colored fill based on volume (inside → outside)
		const expand = PADDING * Math.min(1, this.#volumeSmoothed - 0.01);

		ctx.beginPath();
		this.#roundedRectPath(
			ctx,
			-expand,
			-expand,
			bounds.size.x + expand * 2,
			bounds.size.y + expand * 2,
			cornerRadius,
		);

		const hue = 180 + this.#volumeSmoothed * 120;
		const alpha = fillAlphaBase + this.#volumeSmoothed * 0.4;
		ctx.fillStyle = `hsla(${hue}, 80%, 45%, ${alpha})`;
		ctx.fill();
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
