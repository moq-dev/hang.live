import { Watch, Publish } from "@kixelated/hang";
import { Signal, Signals, cleanup, signal } from "@kixelated/signals";
import { createEffect } from "solid-js";
import { Broadcast } from "./broadcast";
import Settings from "./settings";
import { BroadcastNotifications } from "./notifications";

export type AudioProps = {
	notifications: BroadcastNotifications;
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
	notifications: BroadcastNotifications;

	#volumeSmoothed = 0;

	#signals = new Signals();

	constructor(broadcast: Broadcast, props: AudioProps) {
		this.broadcast = broadcast;
		this.muted = props.muted;
		this.volume = props.volume;
		this.pan = signal(props?.pan ?? 0);
		this.notifications = props.notifications;

		// Proxy the pan to the notifications.
		this.#signals.effect(() => {
			this.notifications.pan.set(this.pan.get());
		});

		this.#signals.effect(() => this.#init());
	}

	#init() {
		const audio = this.broadcast.source.audio.root.get();
		if (!audio) return;

		const { context, node } = audio;

		// We analyze the audio to get the volume before gain/pan.
		const analyser = new AnalyserNode(context, { fftSize: this.#analyserBuffer.length });
		this.#analyser = analyser;
		node.connect(analyser);

		cleanup(() => {
			analyser.disconnect();
			this.#analyser = undefined;
		});

		const gain = new GainNode(context, { gain: this.volume.peek() });
		cleanup(() => gain.disconnect());

		createEffect(() => {
			// Update the gain when the volume changes.
			gain.gain.value = this.muted.get() ? 0 : this.volume.get();
		});

		node.connect(gain);

		if (node.channelCount < 2) {
			gain.connect(context.destination); // output to the speakers
			return;
		}

		const audioPanner = new StereoPannerNode(context, {
			channelCount: node.channelCount,
			pan: this.pan.peek(),
		});
		cleanup(() => audioPanner.disconnect());

		// Update the pan when the pan changes.
		createEffect(() => {
			audioPanner.pan.value = this.pan.get();
		});

		gain.connect(audioPanner);
		audioPanner.connect(context.destination);
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
		if (!this.#analyser) return;

		const bounds = this.broadcast.bounds.peek();
		const scale = this.broadcast.scale;

		ctx.save();
		ctx.translate(bounds.position.x, bounds.position.y);

		const cornerRadius = 32 * scale;
		const fillAlphaBase = 0.3;
		const PADDING = 32;

		// Compute average volume
		this.#analyser.getByteTimeDomainData(this.#analyserBuffer);

		let sum = 0;
		for (let i = 0; i < this.#analyserBuffer.length; i++) {
			const sample = Math.abs(this.#analyserBuffer[i] - 128);
			sum += sample * sample;
		}
		const volume = Math.sqrt(sum) / this.#analyserBuffer.length;
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
