import type * as Catalog from "@moq/hang/catalog";
import * as Moq from "@moq/net";
import { consume } from "@moq/room";
import { Effect, type Getter, Signal } from "@moq/signals";
import * as Watch from "@moq/watch";
import { type ChatFields, consumeExtras, type LocationFields } from "./metadata";

export interface WatchBroadcastProps {
	connection?: Moq.Connection.Established | Signal<Moq.Connection.Established | undefined>;
	enabled?: boolean | Signal<boolean>;
	name?: Moq.Path.Valid | Signal<Moq.Path.Valid>;
	reload?: boolean | Signal<boolean>;
	audio?: { enabled?: boolean | Signal<boolean> };
	video?: { enabled?: boolean | Signal<boolean> };
}

/**
 * Watch pipeline plus hang.live location/chat extras.
 *
 * User/preview come from `@moq/room` consume; location/chat stay hang.live.
 */
export class WatchBroadcast {
	readonly role = "watch" as const;

	readonly #broadcast: Watch.Broadcast;
	readonly #sync: Watch.Sync;
	readonly #videoSource: Watch.Video.Source;
	readonly #videoDecoder: Watch.Video.Decoder;
	readonly #audioSource: Watch.Audio.Source;
	readonly #audioDecoder: Watch.Audio.Decoder;
	readonly #target = new Signal<Watch.Video.Target | undefined>(undefined);
	readonly #flip = new Signal(false);
	readonly #metadata: ReturnType<typeof consume>;
	readonly #extras: ReturnType<typeof consumeExtras>;

	readonly location: LocationFields;
	readonly chat: ChatFields;
	readonly user: {
		id: Getter<string | undefined>;
		name: Getter<string | undefined>;
		avatar: Getter<string | undefined>;
		color: Getter<string | undefined>;
	};
	readonly video: {
		frame: Getter<VideoFrame | undefined>;
		display: Getter<{ width: number; height: number } | undefined>;
		catalog: Getter<Catalog.Video | undefined>;
		target: Signal<Watch.Video.Target | undefined>;
		active: Getter<string | undefined>;
		flip: Signal<boolean>;
		source: Getter<undefined>;
	};
	readonly audio: {
		root: Getter<AudioNode | undefined>;
		catalog: Getter<Catalog.Audio | undefined>;
		active: Getter<string | undefined>;
		source: Getter<undefined>;
	};

	readonly signals = new Effect();

	constructor(props?: WatchBroadcastProps) {
		this.#broadcast = new Watch.Broadcast({
			connection: props?.connection,
			enabled: props?.enabled,
			name: props?.name,
			reload: props?.reload,
		});
		this.signals.cleanup(() => this.#broadcast.close());

		this.#videoSource = new Watch.Video.Source({
			broadcast: this.#broadcast,
			target: this.#target,
			supported: Watch.Video.Decoder.supported,
		});
		this.#audioSource = new Watch.Audio.Source({
			broadcast: this.#broadcast,
			supported: Watch.Audio.Decoder.supported,
		});
		this.signals.cleanup(() => {
			this.#videoSource.close();
			this.#audioSource.close();
		});

		this.#sync = new Watch.Sync({
			latency: Moq.Time.Milli(100),
			connection: props?.connection,
			video: this.#videoSource.out.jitter,
			audio: this.#audioSource.out.jitter,
		});
		this.signals.cleanup(() => this.#sync.close());

		this.#videoDecoder = new Watch.Video.Decoder(this.#videoSource, this.#sync, {
			enabled: props?.video?.enabled,
		});
		this.#audioDecoder = new Watch.Audio.Decoder(this.#audioSource, this.#sync, {
			enabled: props?.audio?.enabled,
		});
		this.signals.cleanup(() => {
			this.#videoDecoder.close();
			this.#audioDecoder.close();
		});

		this.#metadata = consume(this.#broadcast);
		this.#extras = consumeExtras(this.#broadcast);
		this.signals.cleanup(() => {
			this.#metadata.close();
			this.#extras.close();
		});

		this.location = this.#extras.location;
		this.chat = this.#extras.chat;
		this.user = this.#metadata.user;

		this.signals.run((effect) => {
			const catalog = effect.get(this.#videoSource.out.catalog);
			this.#flip.set(catalog?.flip ?? false);
		});

		this.video = {
			frame: this.#videoDecoder.out.frame,
			display: this.#videoDecoder.out.display,
			catalog: this.#videoSource.out.catalog,
			target: this.#target,
			active: this.#videoSource.out.track,
			flip: this.#flip,
			source: new Signal(undefined),
		};
		this.audio = {
			root: this.#audioDecoder.out.root,
			catalog: this.#audioSource.out.catalog,
			active: this.#audioSource.out.track,
			source: new Signal(undefined),
		};
	}

	close() {
		this.signals.close();
	}
}
