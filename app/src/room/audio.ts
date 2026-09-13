import { Effect, Signal } from "@moq/signals";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import * as Meme from "./meme";
import { PannedSound, Sound } from "./sound";

const FADE_TIME = 0.2;
const GAIN_MIN = 0.001;

export type AudioProps = {
	pan?: number;
};

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

	// Public volume for visualization (0 to 1)
	volume = 0;

	#signals = new Effect();

	constructor(broadcast: Broadcast, sound: Sound, props?: AudioProps) {
		this.broadcast = broadcast;
		this.pan = new Signal(props?.pan ?? 0);

		this.sound = new PannedSound(sound, this.pan);

		this.#signals.run(this.#runMeme.bind(this));

		this.#signals.run((effect) => {
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

		this.#signals.run((effect) => {
			const panner = effect.get(this.#panner);
			if (!panner) return;

			effect.cleanup(() => panner.pan.cancelScheduledValues(panner.context.currentTime));

			const pan = Math.max(-1, Math.min(1, effect.get(this.pan)));
			panner.pan.linearRampToValueAtTime(pan, panner.context.currentTime + FADE_TIME);
		});

		this.#signals.run((effect) => {
			const gain = effect.get(this.#gain);
			if (!gain) return;

			// Cancel any scheduled transitions on change.
			effect.cleanup(() => gain.gain.cancelScheduledValues(gain.context.currentTime));

			const volume = effect.get(Settings.audio.enabled) ? effect.get(Settings.audio.volume) : 0;

			if (volume < GAIN_MIN) {
				gain.gain.exponentialRampToValueAtTime(GAIN_MIN, gain.context.currentTime + FADE_TIME);
				gain.gain.setValueAtTime(0, gain.context.currentTime + FADE_TIME + 0.01);
			} else {
				gain.gain.exponentialRampToValueAtTime(volume, gain.context.currentTime + FADE_TIME);
			}
		});

		// Don't output to the speakers if we're publishing the broadcast.
		if (this.broadcast.source.role !== "publish") {
			this.#signals.run(this.#runOutput.bind(this));
		}
	}

	#runMeme(effect: Effect) {
		const meme = effect.get(this.broadcast.meme);
		if (!meme) return;

		if ("element" in meme) {
			this.#runMemeVideo(effect, meme);
		} else {
			effect.spawn(this.#runMemeAudio.bind(this, effect, meme));
		}
	}

	#runMemeVideo(effect: Effect, meme: Meme.Video) {
		effect.run((effect) => {
			// Toggle the muted state
			meme.element.muted = effect.get(this.sound.parent.suspended);
		});

		const source = this.sound.media(meme.element);
		effect.cleanup(() => source.disconnect());

		// Start playing once connected.
		meme.element.play().catch((err) => {
			console.error("Meme audio failed to play:", err);
		});

		// Only start playing after we've connected the audio.
		effect.cleanup(() => meme.element.pause());
	}

	async #runMemeAudio(effect: Effect, meme: Meme.Audio) {
		// We can't use HTMLAudioElement because iOS requires user interaction to play.
		const node = await this.sound.load(meme.url);
		effect.cleanup(() => node.disconnect());

		effect.event(node, "ended", () => {
			if (this.broadcast.meme.peek() === meme) {
				this.broadcast.meme.set(undefined); // Signal done
			}
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

	tick() {
		// Get audio from the notification/meme context
		const soundBuffer = this.sound.analyze();
		if (!soundBuffer) {
			this.volume *= 0.95; // Fade out when no analyser
			return;
		}

		// Take the absolute value of the distance from 128 (silence)
		for (let i = 0; i < soundBuffer.length; i++) {
			soundBuffer[i] = Math.abs(soundBuffer[i] - 128);
		}

		// If the broadcast audio is playing, combine the buffers
		if (this.#analyser) {
			if (this.#analyserBuffer.length !== soundBuffer.length) {
				throw new Error("analyser buffer length mismatch");
			}

			this.#analyser.getByteTimeDomainData(this.#analyserBuffer);
			for (let i = 0; i < this.#analyserBuffer.length; i++) {
				soundBuffer[i] += Math.abs(this.#analyserBuffer[i] - 128);
			}
		}

		// Calculate RMS volume
		let sum = 0;
		for (let i = 0; i < soundBuffer.length; i++) {
			const sample = soundBuffer[i];
			sum += sample * sample;
		}
		const volume = Math.sqrt(sum) / soundBuffer.length;

		// Smooth the volume with exponential moving average
		this.#volumeSmoothed = this.#volumeSmoothed * 0.7 + volume * 0.3;

		// Store the smoothed volume (already in the right range from the buffer values)
		this.volume = this.#volumeSmoothed;
	}

	close() {
		this.#signals.close();
		this.sound.close();
	}
}
