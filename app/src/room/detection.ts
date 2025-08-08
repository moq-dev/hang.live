import { Publish } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import * as Comlink from "comlink";
import type { Detection, DetectionWorker } from "./worker/detection";

// Vite-specific import for worker
import DetectionWorkerUrl from "./worker/detection?worker&url";

export type { Detection };

export interface DetectionProps {
	enabled?: boolean;
	interval?: number; // milliseconds between detections
	//threshold?: number;
}

export class Detector {
	video: Publish.Video;
	enabled: Signal<boolean>;
	detections = new Signal<Record<string, Detection>>({});

	#interval: number;
	#signals = new Effect();

	constructor(video: Publish.Video, props?: DetectionProps) {
		this.video = video;
		this.#interval = props?.interval ?? 2000; // Default 2 seconds
		this.enabled = new Signal(props?.enabled ?? false);

		this.#signals.effect(this.#run.bind(this));
	}

	#run(effect: Effect) {
		const enabled = effect.get(this.enabled);
		if (!enabled) return;

		const active = effect.get(this.video.active);
		if (!active) return;

		// Initialize worker
		const worker = new Worker(DetectionWorkerUrl, { type: "module" });
		effect.cleanup(() => worker.terminate());

		const api = Comlink.wrap<DetectionWorker>(worker);

		const process = async () => {
			const frame = this.video.frame.peek();
			if (!frame) return;

			const cloned = frame.clone();
			await api.detect(Comlink.transfer(cloned, [cloned]));
		};

		effect.spawn(async (cancel) => {
			const ready = await Promise.race([
				api.ready(),
				cancel,
			]);
			if (!ready) return;

			process();
			effect.interval(process, this.#interval);
		});
	}

	close() {
		this.#signals.close();
	}
}
