import { Effect, Signal } from "@kixelated/signals";
import * as Comlink from "comlink";
import Settings from "../../settings";

import type { TTSWorker } from "./worker";

// Weighted join announcements with varying rarity
const JOIN_ANNOUNCEMENTS = [
	// Common (70% chance total)
	{ text: "{name} joined.", weight: 20 },
	{ text: "Sup {name}.", weight: 15 },
	{ text: "{name} is here.", weight: 10 },
	{ text: "What's up {name}?", weight: 10 },
	{ text: "Yo {name}.", weight: 10 },
	{ text: "{name} has entered.", weight: 8 },
	{ text: "Welcome {name}.", weight: 7 },

	// Uncommon (20% chance total)
	{ text: "{name} has arrived.", weight: 4 },
	{ text: "{name} rolled up.", weight: 3 },
	{ text: "{name} showed up.", weight: 3 },
	{ text: "{name} slid in.", weight: 2.5 },
	{ text: "{name} just dropped.", weight: 2.5 },
	{ text: "Look who it is, {name}.", weight: 2 },
	{ text: "{name} in the building.", weight: 2 },
	{ text: "{name} has graced us.", weight: 1 },

	// Rare (8% chance total)
	{ text: "Behold, {name} approaches.", weight: 1.5 },
	{ text: "{name} has manifested.", weight: 1.5 },
	{ text: "Alert: {name} detected.", weight: 1 },
	{ text: "{name} teleported in.", weight: 1 },
	{ text: "A wild {name} appeared.", weight: 1 },
	{ text: "{name} spawned", weight: 1 },
	{ text: "{name} has entered the chat.", weight: 0.5 },
	{ text: "Everybody act normal, {name} is here.", weight: 0.5 },

	// Ultra-rare (2% chance total)
	{ text: "Praise be, the lord and savior {name} has graced us with their presence.", weight: 0.3 },
	{ text: "Ladies and gentlemen, we got {name} here.", weight: 0.3 },
	{ text: "Stop everything, {name} has blessed us with their divine presence.", weight: 0.2 },
	{ text: "Breaking news: {name} has been spotted in the vicinity.", weight: 0.2 },
	{ text: "The prophecy foretold of {name}'s arrival.", weight: 0.2 },
	{ text: "Historians will mark this moment: {name} has joined.", weight: 0.2 },
	{ text: "The legends spoke of this day when {name} would join us.", weight: 0.15 },
	{ text: "Sound the horns, {name} has arrived at the gates.", weight: 0.15 },
	{ text: "By the ancient laws, we welcome {name} to our realm.", weight: 0.1 },
	{ text: "The stars have aligned to bring us {name}.", weight: 0.1 },
	{
		text: "From the Ghastly Eyrie I can see to the ends of the world, and from this vantage point I declare with utter certainty that {name} has joined the hang!",
		weight: 0.01,
	},
] as const;

const JOIN_ANNOUNCEMENTS_WEIGHT = JOIN_ANNOUNCEMENTS.reduce((sum, item) => sum + item.weight, 0);

// Weighted leave announcements with varying rarity
const LEAVE_ANNOUNCEMENTS = [
	// Common (70% chance total)
	{ text: "{name} has left.", weight: 20 },
	{ text: "{name} left.", weight: 15 },
	{ text: "Bye {name}.", weight: 10 },
	{ text: "{name} is gone.", weight: 8 },
	{ text: "{name} disconnected.", weight: 7 },
	{ text: "See ya {name}.", weight: 5 },
	{ text: "{name} dipped.", weight: 5 },

	// Uncommon (20% chance total)
	{ text: "{name} peaced out.", weight: 3 },
	{ text: "{name} bounced.", weight: 3 },
	{ text: "{name} vanished.", weight: 2.5 },
	{ text: "{name} has departed.", weight: 2 },
	{ text: "{name} ghosted.", weight: 2 },
	{ text: "{name} rage quit.", weight: 2 },
	{ text: "{name} went to get milk.", weight: 1.5 },
	{ text: "{name} has abandoned us.", weight: 1.5 },
	{ text: "{name} evaporated.", weight: 1.5 },

	// Rare (8% chance total)
	{ text: "{name} died.", weight: 1.5 },
	{ text: "{name} got thanos snapped.", weight: 1 },
	{ text: "{name} returned to the void.", weight: 1 },
	{ text: "{name} has been yeeted from existence.", weight: 1 },
	{ text: "{name} faded away.", weight: 0.8 },
	{ text: "Press F to pay respects, {name} is gone.", weight: 0.8 },
	{ text: "{name} has left the chat.", weight: 0.5 },
	{ text: "{name} went poof.", weight: 0.5 },
	{ text: "{name} disconnected from the matrix.", weight: 0.5 },
	{ text: "{name} was recalled to headquarters.", weight: 0.4 },

	// Ultra-rare (2% chance total)
	{ text: "The universe is a sadder place now that {name} has left.", weight: 0.3 },
	{ text: "And thus {name} departed, never to be seen again... probably.", weight: 0.25 },
	{ text: "{name} has ascended to a higher plane of existence.", weight: 0.2 },
	{ text: "Historians will note the tragic departure of {name}.", weight: 0.2 },
	{ text: "With a heavy heart, we bid farewell to {name}.", weight: 0.2 },
	{ text: "The prophecy has been fulfilled, {name} has left us.", weight: 0.15 },
	{ text: "{name} has been banished to the shadow realm.", weight: 0.15 },
	{ text: "Legends say {name} will return... but not today.", weight: 0.15 },
	{ text: "As foretold by the ancients, {name} has departed.", weight: 0.1 },
	{ text: "The void calls, and {name} must answer.", weight: 0.1 },
	{ text: "{name} has gone where no one can follow.", weight: 0.1 },
	{ text: "{name} has been sent to the void.", weight: 0.1 },
	{
		text: "From the Ghastly Eyrie I can see to the ends of the world, and from this vantage point I declare with utter certainty that {name} has left the hang!",
		weight: 0.01,
	},
];

const LEAVE_ANNOUNCEMENTS_WEIGHT = LEAVE_ANNOUNCEMENTS.reduce((sum, item) => sum + item.weight, 0);

export type TTSProps = {
	enabled?: boolean | Signal<boolean>;
};

export class TTS {
	enabled: Signal<boolean>;
	context: AudioContext;

	ready = new Signal<boolean>(false); // Whether a TTS model is loaded
	progress = new Signal<number | undefined>(undefined); // From 0 to 1

	#worker: Comlink.Remote<TTSWorker> | undefined;
	#queue: AudioBufferSourceNode[] = [];

	#signals = new Effect();

	constructor(context: AudioContext, props?: TTSProps) {
		this.context = context;
		this.enabled = Signal.from(props?.enabled ?? false);

		this.#signals.effect((effect) => {
			// Only start loading the TTS model when enabled.
			if (!effect.get(this.enabled)) return;

			const quality = effect.get(Settings.audio.tts);
			if (quality === "low") {
				// Don't load worker model for low quality (uses SpeechSynthesis instead)
				this.ready.set(true);
				this.progress.set(1);
				return;
			}

			if (quality !== "high") return;

			const worker = new Worker(new URL("./worker", import.meta.url), { type: "module" });
			effect.cleanup(() => {
				worker.terminate();
				this.#worker = undefined;
			});

			const tts = Comlink.wrap<TTSWorker>(worker);

			effect.spawn(async () => {
				await tts.setQuality(quality);

				for (;;) {
					const progress = await Promise.race([tts.progress(), effect.cancel]);
					if (progress === undefined) break;

					this.progress.set(progress);

					if (progress === 1) {
						this.ready.set(true);
						break;
					}
				}
			});

			effect.cleanup(() => {
				this.progress.set(undefined);
				this.ready.set(false);
			});

			this.#worker = tts;
			this.#signals.cleanup(() => {
				this.#worker = undefined;
			});
		});
	}

	async say(text: string) {
		if (!this.enabled.peek() || this.context.state === "suspended") return;

		const quality = Settings.audio.tts.peek();

		// Use browser's SpeechSynthesis for low quality
		if (quality === "low") {
			return new Promise<void>((resolve) => {
				const utterance = new SpeechSynthesisUtterance(text);
				utterance.rate = 1.1;

				utterance.onend = () => resolve();
				utterance.onerror = () => resolve();

				speechSynthesis.speak(utterance);
			});
		}

		// Use worker for high quality
		if (!this.#worker) return;

		const audioUrl = await this.#worker.generate(text);
		if (!audioUrl) return;

		// Fetch the audio from the object URL
		const response = await fetch(audioUrl);
		const arrayBuffer = await response.arrayBuffer();
		const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

		// Play the audio through the panner
		const source = new AudioBufferSourceNode(this.context, { buffer: audioBuffer });
		source.connect(this.context.destination);

		// Queue the audio to play after the current one ends.
		if (this.#queue.length === 0) {
			source.start();
		}

		this.#queue.push(source);
		source.onended = () => {
			this.#queue.shift();
			if (this.#queue.length > 0) {
				this.#queue[0].start();
			}
		};

		// Clean up the object URL
		URL.revokeObjectURL(audioUrl);
	}

	async joined(name: string) {
		const random = Math.random() * JOIN_ANNOUNCEMENTS_WEIGHT;
		let accumulated = 0;

		let text = `${name} joined`;
		for (const announcement of JOIN_ANNOUNCEMENTS) {
			accumulated += announcement.weight;
			if (random <= accumulated) {
				text = announcement.text.replace("{name}", name);
				break;
			}
		}

		await this.say(text);
	}

	async left(name: string) {
		const random = Math.random() * LEAVE_ANNOUNCEMENTS_WEIGHT;
		let accumulated = 0;

		let text = `${name} left`;
		for (const announcement of LEAVE_ANNOUNCEMENTS) {
			accumulated += announcement.weight;
			if (random <= accumulated) {
				text = announcement.text.replace("{name}", name);
				break;
			}
		}

		await this.say(text);
	}

	resume() {
		this.context.resume();
	}

	close() {
		this.#signals.close();
	}
}
