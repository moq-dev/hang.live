import { Watch, Publish } from "@kixelated/hang";
import { Signal, Signals, cleanup, signal } from "@kixelated/signals";
import { createEffect } from "solid-js";
import { Bounds } from "./geometry";

export type AudioProps = {
	muted?: boolean;
	volume?: number;
	pan?: number;
};

export type AudioSource = Watch.Audio | Publish.Audio;

/*
export interface AudioSource {
	root: Memo<{ context: AudioContext; node: AudioNode } | undefined>;
	close: () => void;

	// Called to stop downloading when muted, but obviously we don't want to stop publishing so it's optional.
	enabled?: Signal<boolean>;
}
*/

export class Audio {
	source: AudioSource;
	muted: Signal<boolean>;
	volume: Signal<number>;
	pan: Signal<number>;

	#analyser?: AnalyserNode;
	#analyserBuffer = new Uint8Array(1024);

	#volumeSmoothed = 0;

	#signals = new Signals();

	constructor(source: AudioSource, props?: AudioProps) {
		this.source = source;
		this.muted = signal(props?.muted ?? false);
		this.volume = signal(props?.volume ?? 1);
		this.pan = signal(props?.pan ?? 0);

		this.#signals.effect(() => this.#init());
	}

	#init() {
		const audio = this.source.root.get();
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

	renderBackground(ctx: CanvasRenderingContext2D, bounds: Bounds, scale: number) {
		ctx.save();
		ctx.translate(bounds.position.x + ctx.canvas.width / 2, bounds.position.y + ctx.canvas.height / 2);

		const cornerRadius = 32 * scale;
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

	render(ctx: CanvasRenderingContext2D, bounds: Bounds, scale: number) {
		if (!this.#analyser) return;

		ctx.save();
		ctx.translate(bounds.position.x + ctx.canvas.width / 2, bounds.position.y + ctx.canvas.height / 2);

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
		this.source.close();
	}
}
