import type * as Catalog from "@moq/hang/catalog";
import type * as Moq from "@moq/net";
import { consume } from "@moq/room";
import { Effect, type Getter, Signal } from "@moq/signals";
import * as Watch from "@moq/watch";
import { type ChatFields, consumeExtras, type LocationFields } from "./metadata";

export interface WatchBroadcastProps {
	connection: Moq.Connection;
	name: Moq.Path.Valid;
	/** Download and decode audio while true. */
	audio: Getter<boolean>;
	/** Download and decode video while true. */
	video: Getter<boolean>;
}

/**
 * One remote broadcast: a headless `Watch.Player` plus hang.live location/chat extras.
 *
 * Hang paints frames with its own WebGL renderer and routes audio through its own spatial graph,
 * so the player gets no canvas and its speaker output stays silent.
 */
export class WatchBroadcast {
	readonly role = "watch" as const;

	readonly #player: Watch.Player;
	readonly #target = new Signal<Watch.Video.Target | undefined>(undefined);
	readonly #flip = new Signal(false);

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
		error: Getter<Error | undefined>;
		stats: Getter<Watch.Video.Stats | undefined>;
		flip: Signal<boolean>;
	};
	readonly audio: {
		root: Getter<AudioNode | undefined>;
		catalog: Getter<Catalog.Audio | undefined>;
		active: Getter<string | undefined>;
		error: Getter<Error | undefined>;
		stats: Getter<Watch.Audio.Stats | undefined>;
	};

	readonly signals = new Effect();

	constructor(props: WatchBroadcastProps) {
		const visible = new Signal<Watch.Video.Visible>("never");
		const muted = new Signal(true);
		this.signals.run((effect) => visible.set(effect.get(props.video) ? "always" : "never"));
		this.signals.run((effect) => muted.set(!effect.get(props.audio)));

		this.#player = new Watch.Player({
			origin: props.connection.origin,
			name: props.name,
			// The room only creates this once the broadcast is announced.
			follow: false,
			video: { target: this.#target, visible },
			audio: { muted, volume: 0 },
			// Share the connection's receive estimate with every other tile, so ABR and probing see the whole room.
			viewer: { viewers: props.connection.viewers },
		});
		this.signals.cleanup(() => this.#player.close());

		const metadata = consume(this.#player.broadcast);
		// Only WebTransport carries datagrams; over the WebSocket fallback, windows move on release instead.
		const datagrams = new Signal(false);
		this.signals.run((effect) => datagrams.set(effect.get(props.connection.transport) === "webtransport"));
		const extras = consumeExtras(this.#player.broadcast, datagrams);
		this.signals.cleanup(() => {
			metadata.close();
			extras.close();
		});

		this.location = extras.location;
		this.chat = extras.chat;
		this.user = metadata.user;

		const decoder = { video: this.#player.video, audio: this.#player.audio };
		this.signals.run((effect) => {
			const catalog = effect.get(decoder.video.source.out.catalog);
			this.#flip.set(catalog?.flip ?? false);
		});

		this.video = {
			frame: decoder.video.out.frame,
			display: decoder.video.out.display,
			catalog: decoder.video.source.out.catalog,
			target: this.#target,
			active: decoder.video.source.out.track,
			error: decoder.video.out.error,
			stats: decoder.video.out.stats,
			flip: this.#flip,
		};
		this.audio = {
			root: decoder.audio.out.root,
			catalog: decoder.audio.source.out.catalog,
			active: decoder.audio.source.out.track,
			error: decoder.audio.out.error,
			stats: decoder.audio.out.stats,
		};

		// A decode failure otherwise only shows as a frozen avatar or silence.
		for (const [kind, error] of [
			["video", this.video.error],
			["audio", this.audio.error],
		] as const) {
			this.signals.run((effect) => {
				const err = effect.get(error);
				if (err) console.error(`${props.name}: ${kind} decode failed:`, err);
			});
		}
	}

	close() {
		this.signals.close();
	}
}
