/**
 * hang.live catalog extras: location, typing, and chat messages.
 *
 * User/preview are served by `@moq/room`. This module adds `hang/location.json`,
 * `hang/chat.json` (typing), and `@moq/room`'s `chat` message window on the same
 * catalog `hang` section.
 */

import type { Root as CatalogRoot } from "@moq/hang/catalog";
import * as Json from "@moq/json";
import * as Moq from "@moq/net";
import type * as Publish from "@moq/publish";
import { Chat, type Preview, type User } from "@moq/room";
import { Effect, Signal } from "@moq/signals";
import type * as Watch from "@moq/watch";
import * as z from "zod/mini";

export type { Preview, User };

const TRACKS = {
	location: "hang/location.json",
	chat: "hang/chat.json",
} as const;

const HANG_PRIORITY = 90;

export type Position = {
	x?: number;
	y?: number;
	z?: number;
	s?: number;
};

export type LocationValue = {
	window?: {
		position?: Position;
		handle?: string;
	};
	peers?: {
		positions?: Record<string, Position>;
	};
};

export type ChatValue = {
	// Superseded by the `messages` window; still written for readers that predate it.
	message?: string;
	typing?: boolean;
};

// A remote publisher's values are untrusted, so each is validated before it reaches the UI.
const PositionSchema: z.ZodMiniType<Position> = z.object({
	x: z.optional(z.number()),
	y: z.optional(z.number()),
	z: z.optional(z.number()),
	s: z.optional(z.number()),
});

const LocationSchema: z.ZodMiniType<LocationValue> = z.object({
	window: z.optional(
		z.object({
			position: z.optional(PositionSchema),
			handle: z.optional(z.string()),
		}),
	),
	peers: z.optional(
		z.object({
			positions: z.optional(z.record(z.string(), PositionSchema)),
		}),
	),
});

const ChatSchema: z.ZodMiniType<ChatValue> = z.object({
	message: z.optional(z.string()),
	typing: z.optional(z.boolean()),
});

export type HangCatalog = {
	user?: { track: string };
	preview?: { track: string };
	location?: { track: string };
	chat?: { track: string };
	/** `@moq/room`'s chat message window. A broadcast without it sends messages on `chat` instead. */
	messages?: { track: string };
};

export type ExtendedCatalog = CatalogRoot & {
	hang?: HangCatalog;
};

export type LocationFields = {
	window: {
		enabled: Signal<boolean>;
		position: Signal<Position | undefined>;
		handle: Signal<string | undefined>;
	};
	peers: {
		enabled: Signal<boolean>;
		positions: Signal<Record<string, Position> | undefined>;
	};
};

export type ChatFields = {
	message: {
		enabled: Signal<boolean>;
		latest: Signal<string | undefined>;
	};
	typing: {
		enabled: Signal<boolean>;
		active: Signal<boolean | undefined>;
	};
};

export function locationFields(): LocationFields {
	return {
		window: {
			enabled: new Signal(true),
			position: new Signal<Position | undefined>(undefined),
			handle: new Signal<string | undefined>(Math.random().toString(36).substring(2, 15)),
		},
		peers: {
			enabled: new Signal(true),
			positions: new Signal<Record<string, Position> | undefined>(undefined),
		},
	};
}

export function chatFields(): ChatFields {
	return {
		message: {
			enabled: new Signal(true),
			latest: new Signal<string | undefined>(undefined),
		},
		typing: {
			enabled: new Signal(true),
			active: new Signal<boolean | undefined>(undefined),
		},
	};
}

/** Publish location and chat tracks on a `@moq/room` camera/screen broadcast. */
export function serveExtras(
	broadcast: { net: Publish.Broadcast["net"]; catalog: Pick<Publish.Broadcast["catalog"], "mutate"> },
	location: LocationFields,
	chat: ChatFields,
	effect: Effect,
): void {
	broadcast.catalog.mutate((catalog) => {
		const extended = catalog as ExtendedCatalog;
		extended.hang ??= {};
		extended.hang.location = { track: TRACKS.location };
		extended.hang.chat = { track: TRACKS.chat };
		extended.hang.messages = { track: Chat.TRACK };
	});

	effect.cleanup(() => {
		broadcast.catalog.mutate((catalog) => {
			const hang = (catalog as ExtendedCatalog).hang;
			if (!hang) return;
			delete hang.location;
			delete hang.chat;
			delete hang.messages;
		});
	});

	serveSnapshot(broadcast, TRACKS.location, effect, (effect) => ({
		window: {
			position: effect.get(location.window.position),
			handle: effect.get(location.window.handle),
		},
		peers: {
			positions: effect.get(location.peers.positions),
		},
	}));

	serveSnapshot(broadcast, TRACKS.chat, effect, (effect) => ({
		message: effect.get(chat.message.latest),
		typing: effect.get(chat.typing.active),
	}));

	// Each send is its own record, so a repeated or quickly replaced message still reaches readers.
	effect.run((effect) => {
		const net = effect.get(broadcast.net);
		if (!net) return;

		const publisher = Chat.Publisher.create(net);
		effect.cleanup(() => publisher.finish());

		effect.run((effect) => {
			const message = effect.get(chat.message.latest);
			if (message) publisher.send(message);
		});
	});
}

function serveSnapshot<T>(
	broadcast: { net: Publish.Broadcast["net"]; catalog: Pick<Publish.Broadcast["catalog"], "mutate"> },
	name: string,
	effect: Effect,
	value: (effect: Effect) => T,
): void {
	effect.run((effect) => {
		const net = effect.get(broadcast.net);
		if (!net) return;

		// Timed like `@moq/room`'s own snapshots, so each update opens its group at the write time.
		const track = net.createTrack(name, {
			timescale: Moq.Time.Timescale.MILLI,
			priority: HANG_PRIORITY,
			refresh: { ratio: 8 },
			compression: "deflate",
		});
		if (!track) throw new Error(`the track ${name} already exists`);
		effect.cleanup(() => {
			track.finish();
			track.close();
		});

		const producer = new Json.Snapshot.Producer<T>({ track });
		effect.cleanup(() => producer.finish());

		effect.run((effect) => {
			producer.update(value(effect), Json.next(track, Moq.Time.Timestamp.now()));
		});
	});
}

export type ConsumedExtras = {
	location: LocationFields;
	chat: ChatFields;
	close: () => void;
};

/** Subscribe to location and chat on a watched broadcast. */
export function consumeExtras(broadcast: { out: Pick<Watch.Broadcast["out"], "catalog" | "active"> }): ConsumedExtras {
	const location = locationFields();
	const chat = chatFields();
	const signals = new Effect();

	signals.run((effect) => {
		const catalog = effect.get(broadcast.out.catalog) as ExtendedCatalog | undefined;
		const hang = catalog?.hang;
		const active = effect.get(broadcast.out.active);
		effect.cleanup(() => {
			location.window.position.set(undefined);
			location.window.handle.set(undefined);
			location.peers.positions.set(undefined);
			chat.message.latest.set(undefined);
			chat.typing.active.set(undefined);
		});
		if (!active || !hang) return;

		if (hang.location) {
			subscribeJson(active, hang.location.track, LocationSchema, effect, (value) => {
				location.window.position.set(value.window?.position);
				location.window.handle.set(value.window?.handle);
				location.peers.positions.set(value.peers?.positions);
			});
		}

		// Decided once per catalog: a broadcast advertising the window sends messages only there.
		const windowed = hang.messages !== undefined;
		if (hang.chat) {
			subscribeJson(active, hang.chat.track, ChatSchema, effect, (value) => {
				if (!windowed) chat.message.latest.set(value.message);
				chat.typing.active.set(value.typing);
			});
		}

		if (hang.messages) {
			subscribeMessages(active, hang.messages.track, effect, chat.message.latest);
		}
	});

	return {
		location,
		chat,
		close: () => signals.close(),
	};
}

/**
 * Feed each value on `name` that matches `schema` to `update`, skipping straight to the newest.
 *
 * A value that does not match ends the subscription, as any failed read does: it never reaches the
 * UI and the last valid one stays.
 */
function subscribeJson<T>(
	broadcast: Moq.Broadcast.Consumer,
	name: string,
	schema: z.ZodMiniType<T>,
	effect: Effect,
	update: (value: T) => void,
): void {
	const consumer = new Json.Snapshot.Consumer<T>({ track: broadcast.track(name), schema, priority: HANG_PRIORITY });
	effect.cleanup(() => consumer.close());
	effect.spawn(async () => {
		// A failed read ends the loop, so release the subscription instead of downloading what nothing reads.
		try {
			for (;;) {
				const value = await effect.race(consumer.latest());
				if (value === undefined) break;
				update(value.value);
			}
		} finally {
			consumer.close();
		}
	});
}

/** Show each message pushed to the window on `name`, clearing it once it leaves the window. */
function subscribeMessages(
	broadcast: Moq.Broadcast.Consumer,
	name: string,
	effect: Effect,
	latest: Signal<string | undefined>,
): void {
	const subscriber = new Chat.Subscriber(broadcast.track(name).subscribe());
	effect.cleanup(() => subscriber.close());
	effect.spawn(async () => {
		let shown: number | undefined;
		try {
			for (;;) {
				const next = await effect.race(subscriber.recv());
				if (next === undefined) break;
				const event = next.value;
				if ("push" in event) {
					shown = event.push.index;
					// Forced, so the same text sent twice still shows twice.
					latest.set(event.push.value, true);
				} else if ("pop" in event && shown !== undefined && shown < event.pop.end) {
					shown = undefined;
					latest.set(undefined);
				}
			}
		} finally {
			subscriber.close();
		}
	});
}

export type PreviewInfo = Preview;
