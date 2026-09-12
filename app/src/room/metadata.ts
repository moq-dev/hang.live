/**
 * hang.live catalog extras: location and JSON chat.
 *
 * User/preview are served by `@moq/room`. This module adds `hang/location.json`
 * and `hang/chat.json` on the same catalog `hang` section.
 */

import type { Root as CatalogRoot } from "@moq/hang/catalog";
import * as Json from "@moq/json";
import type * as Moq from "@moq/net";
import type * as Publish from "@moq/publish";
import type { Preview, User } from "@moq/room";
import { Effect, Signal } from "@moq/signals";
import type * as Watch from "@moq/watch";

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
	message?: string;
	typing?: boolean;
};

export type HangCatalog = {
	user?: { track: string };
	preview?: { track: string };
	location?: { track: string };
	chat?: { track: string };
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
	});

	effect.cleanup(() => {
		broadcast.catalog.mutate((catalog) => {
			const hang = (catalog as ExtendedCatalog).hang;
			if (!hang) return;
			delete hang.location;
			delete hang.chat;
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

		const track = net.createTrack(name, { latencyMax: 86_400_000, priority: HANG_PRIORITY });
		effect.cleanup(() => track.close());

		const producer = new Json.Snapshot.Producer<T>({ track });
		effect.cleanup(() => producer.finish());

		effect.run((effect) => {
			producer.update(value(effect));
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
			subscribeJson<LocationValue>(active, hang.location.track, effect, (value) => {
				location.window.position.set(value.window?.position);
				location.window.handle.set(value.window?.handle);
				location.peers.positions.set(value.peers?.positions);
			});
		}

		if (hang.chat) {
			subscribeJson<ChatValue>(active, hang.chat.track, effect, (value) => {
				chat.message.latest.set(value.message);
				chat.typing.active.set(value.typing);
			});
		}
	});

	return {
		location,
		chat,
		close: () => signals.close(),
	};
}

function subscribeJson<T>(
	broadcast: Moq.Broadcast.Consumer,
	name: string,
	effect: Effect,
	update: (value: T) => void,
): void {
	const track = broadcast.track(name).subscribe({ priority: HANG_PRIORITY });
	effect.cleanup(() => track.close());

	const consumer = new Json.Snapshot.Consumer<T>(track);
	effect.spawn(async () => {
		for (;;) {
			const value = await Promise.race([effect.cancel, consumer.next()]);
			if (value === undefined) break;
			update(value);
		}
	});
}

export type PreviewInfo = Preview;
