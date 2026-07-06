import { Catalog } from "@moq/hang";
import * as Json from "@moq/json";
import type * as Moq from "@moq/lite";
import { Effect, Signal } from "@moq/signals";
import type { PreviewInfo, PreviewValue } from "../metadata";

export type MemberProps = {
	enabled?: boolean | Signal<boolean>;
};

export class Member {
	broadcast: Moq.Broadcast;
	enabled: Signal<boolean>;
	info: Signal<PreviewInfo | undefined>;
	#previewTrack = new Signal<string | undefined>(undefined);

	active = new Signal<boolean>(false);

	signals = new Effect();

	constructor(broadcast: Moq.Broadcast, props?: MemberProps) {
		this.broadcast = broadcast;
		this.enabled = Signal.from(props?.enabled ?? false);
		this.info = new Signal<PreviewInfo | undefined>(undefined);

		this.signals.effect((effect) => {
			if (!effect.get(this.enabled)) return;

			const track = this.broadcast.subscribe("catalog.json", Catalog.PRIORITY.catalog);
			effect.cleanup(() => track.close());

			effect.spawn(async () => {
				try {
					const consumer = new Catalog.Consumer<ExtendedCatalog>(track);
					for (;;) {
						const catalog = await Promise.race([effect.cancel, consumer.next()]);
						if (!catalog) break;

						this.#previewTrack.set(catalog.hang?.preview?.track);
					}
				} finally {
					this.#previewTrack.set(undefined);
					this.info.set(undefined);
				}
			});
		});

		this.signals.effect((effect) => {
			const previewTrack = effect.get(this.#previewTrack);
			if (!previewTrack) return;

			const track = this.broadcast.subscribe(previewTrack, 0);
			effect.cleanup(() => track.close());

			effect.spawn(async () => {
				try {
					const consumer = new Json.Consumer<PreviewValue>(track);
					for (;;) {
						const preview = await Promise.race([effect.cancel, consumer.next()]);
						if (!preview) break;

						this.info.set(preview.info);
					}
				} finally {
					this.info.set(undefined);
				}
			});
		});

		this.signals.effect((effect) => {
			const info = effect.get(this.info);
			this.active.set(!!info);
		});
	}

	close() {
		this.signals.close();
		this.broadcast.close();
	}
}

type ExtendedCatalog = Catalog.Root & {
	hang?: {
		preview?: {
			track: string;
		};
	};
};
