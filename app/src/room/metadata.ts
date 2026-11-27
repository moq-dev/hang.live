/**
 * hang.live catalog extras: location, live pointers, typing, and chat messages.
 *
 * User/preview are served by `@moq/room`. This module adds `hang/location.json`,
 * the `hang/live.json` datagram track, `hang/chat.json` (typing), and `@moq/room`'s
 * `chat` message window on the same catalog `hang` section.
 */

import * as Clock from "@moq/clock";
import type { Root as CatalogRoot } from "@moq/hang/catalog";
import * as Json from "@moq/json";
import * as Moq from "@moq/net";
import type * as Publish from "@moq/publish";
import { Chat, PRIORITY, type HangCatalog as RoomHangCatalog, TRACK, type TrackRef, type User } from "@moq/room";
import { Effect, type Getter, Signal } from "@moq/signals";
import type * as Watch from "@moq/watch";
import * as z from "zod/mini";

/** A broadcast's user details, as `@moq/room` publishes them. */
export type { User };

/** The datagram track of `LiveValue`s, beside `@moq/room`'s well-known tracks. */
const LIVE_TRACK = "hang/live.json";

// While a pointer or drag is live, it repeats this often even when still, so viewers can tell a quiet
// sender from one that vanished without its last datagram.
const LIVE_REPEAT = Clock.Duration.millis(250);

/** How long a viewer keeps the last live state without hearing from its sender. */
export const LIVE_EXPIRY = Clock.Duration.millis(1000);

/** A window's placement: x and y in room coordinates, z order, and scale `s`. */
export type Position = {
	x?: number;
	y?: number;
	z?: number;
	s?: number;
};

/** A move asked of a peer, with the ID it echoes back once applied. Older peers send no ID. */
export type Request = Position & { id?: string };

/** A point in room coordinates, each axis spanning -0.5 to 0.5 across the viewport. */
export type Point = { x: number; y: number };

/** A peer's window that a drag holds somewhere, addressed by the handle that peer publishes. */
export type LivePeer = { handle: string; position: Position };

/**
 * One datagram of pointer state, superseded by the next one or by the location snapshot.
 *
 * Datagrams may drop, so each carries the whole state rather than a change.
 */
type LiveValue = {
	/** The sender's pointer, on its camera broadcast only. */
	cursor?: Point;
	/** This broadcast's own window, while its owner drags it. */
	window?: Position;
	/** A peer's window the sender drags, on its camera broadcast only. */
	peer?: LivePeer;
};

type LocationValue = {
	window?: {
		position?: Position;
		/** Where peers address moves; absent while the publisher refuses them. */
		handle?: string;
		/** The IDs of the moves applied that peers still ask for. Older peers send none. */
		applied?: string[];
	};
	peers?: {
		positions?: Record<string, Request>;
	};
};

type ChatValue = {
	// Superseded by the `messages` window; still written for readers that predate it.
	message?: string;
	typing?: boolean;
};

// A remote publisher's values are untrusted, so each is validated before it reaches the UI.
const PositionShape = {
	x: z.optional(z.number()),
	y: z.optional(z.number()),
	z: z.optional(z.number()),
	s: z.optional(z.number()),
};

const PositionSchema: z.ZodMiniType<Position> = z.object(PositionShape);

const RequestSchema: z.ZodMiniType<Request> = z.object({ ...PositionShape, id: z.optional(z.string()) });

const LocationSchema: z.ZodMiniType<LocationValue> = z.object({
	window: z.optional(
		z.object({
			position: z.optional(PositionSchema),
			handle: z.optional(z.string()),
			applied: z.optional(z.array(z.string())),
		}),
	),
	peers: z.optional(
		z.object({
			positions: z.optional(z.record(z.string(), RequestSchema)),
		}),
	),
});

const LiveSchema: z.ZodMiniType<LiveValue> = z.object({
	cursor: z.optional(z.object({ x: z.number(), y: z.number() })),
	window: z.optional(PositionSchema),
	peer: z.optional(z.object({ handle: z.string(), position: PositionSchema })),
});

const ChatSchema: z.ZodMiniType<ChatValue> = z.object({
	message: z.optional(z.string()),
	typing: z.optional(z.boolean()),
});

/** The catalog's `hang` section, adding Hang's tracks to `@moq/room`'s. */
export type HangCatalog = RoomHangCatalog & {
	/** A datagram track of `LiveValue`s. A broadcast without it updates its window only on release. */
	live?: TrackRef;
	/** `@moq/room`'s chat message window. A broadcast without it sends messages on `chat` instead. */
	messages?: TrackRef;
};

/** A broadcast catalog with Hang's section. */
export type ExtendedCatalog = CatalogRoot & {
	hang?: HangCatalog;
};

/** A broadcast's window placement, moves asked of peers, and live pointer state, as signals. */
export type LocationFields = {
	window: {
		position: Signal<Position | undefined>;
		handle: Signal<string | undefined>;
		/** Whether peers may move this window, which the Remote Control setting decides for local broadcasts. */
		movable: Signal<boolean>;
		applied: Signal<string[] | undefined>;
	};
	peers: {
		positions: Signal<Record<string, Request> | undefined>;
	};
	/** Pointer state streamed over datagrams, cleared once its sender goes quiet. */
	live: {
		cursor: Signal<Point | undefined>;
		window: Signal<Position | undefined>;
		peer: Signal<LivePeer | undefined>;
	};
};

/** A broadcast's latest chat message and typing state, as signals. */
export type ChatFields = {
	message: {
		latest: Signal<string | undefined>;
	};
	typing: {
		active: Signal<boolean | undefined>;
	};
};

/** Location signals with nothing published or received yet. */
export function locationFields(): LocationFields {
	return {
		window: {
			position: new Signal<Position | undefined>(undefined),
			// Unset until a publisher picks one or a watched broadcast's location names it.
			handle: new Signal<string | undefined>(undefined),
			movable: new Signal(true),
			applied: new Signal<string[] | undefined>(undefined),
		},
		peers: {
			positions: new Signal<Record<string, Request> | undefined>(undefined),
		},
		live: {
			cursor: new Signal<Point | undefined>(undefined),
			window: new Signal<Position | undefined>(undefined),
			peer: new Signal<LivePeer | undefined>(undefined),
		},
	};
}

/** Chat signals with nothing published or received yet. */
export function chatFields(): ChatFields {
	return {
		message: {
			latest: new Signal<string | undefined>(undefined),
		},
		typing: {
			active: new Signal<boolean | undefined>(undefined),
		},
	};
}

/** Publish location, live, and chat tracks on a `@moq/room` camera/screen broadcast. */
export function serveExtras(
	broadcast: { net: Publish.Broadcast["net"]; catalog: Pick<Publish.Broadcast["catalog"], "mutate"> },
	location: LocationFields,
	chat: ChatFields,
	effect: Effect,
): void {
	broadcast.catalog.mutate((catalog) => {
		const extended = catalog as ExtendedCatalog;
		extended.hang ??= {};
		extended.hang.location = { track: TRACK.location };
		extended.hang.live = { track: LIVE_TRACK };
		extended.hang.chat = { track: TRACK.chat };
		extended.hang.messages = { track: Chat.TRACK };
	});

	effect.cleanup(() => {
		broadcast.catalog.mutate((catalog) => {
			const hang = (catalog as ExtendedCatalog).hang;
			if (!hang) return;
			delete hang.location;
			delete hang.live;
			delete hang.chat;
			delete hang.messages;
		});
	});

	serveSnapshot(broadcast, TRACK.location, effect, (effect) => {
		// Peers address moves by handle and show a tile without one as locked.
		const movable = effect.get(location.window.movable);
		return {
			window: {
				position: effect.get(location.window.position),
				handle: movable ? effect.get(location.window.handle) : undefined,
				// Present even when empty, so peers know to wait for the echo instead of matching positions.
				applied: movable ? (effect.get(location.window.applied) ?? []) : undefined,
			},
			peers: {
				positions: effect.get(location.peers.positions),
			},
		};
	});

	serveLive(broadcast, location.live, effect);

	serveSnapshot(broadcast, TRACK.chat, effect, (effect) => ({
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
			priority: PRIORITY,
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

function serveLive(broadcast: { net: Publish.Broadcast["net"] }, live: LocationFields["live"], effect: Effect): void {
	const encoder = new TextEncoder();

	effect.run((effect) => {
		const net = effect.get(broadcast.net);
		if (!net) return;

		// Datagrams reach only viewers whose transport carries them; the rest wait for the snapshot.
		const track = net.createDatagrams(LIVE_TRACK, {
			timescale: Moq.Time.Timescale.MILLI,
			priority: PRIORITY,
		});
		if (!track) throw new Error(`the datagram track ${LIVE_TRACK} already exists`);
		effect.cleanup(() => track.finish());

		effect.run((effect) => {
			const value: LiveValue = {
				cursor: effect.get(live.cursor),
				window: effect.get(live.window),
				peer: effect.get(live.peer),
			};
			const payload = encoder.encode(JSON.stringify(value));
			const send = () => track.append(Moq.Time.Timestamp.now(), payload);

			// An empty state goes out once, so viewers drop the pointer without waiting for it to expire.
			send();
			if (value.cursor || value.window || value.peer) effect.interval(send, LIVE_REPEAT);
		});
	});
}

/** The location and chat read from a watched broadcast, which stop updating on `close`. */
export type ConsumedExtras = {
	location: LocationFields;
	/** Whether the broadcast publishes its location, which a tool outside Hang, such as OBS, does not; true until its catalog says. */
	located: Getter<boolean>;
	chat: ChatFields;
	close: () => void;
};

/**
 * Subscribe to location and chat on a watched broadcast, and to live pointers while `datagrams` says the
 * connection's transport carries them.
 */
export function consumeExtras(
	broadcast: { out: Pick<Watch.Broadcast["out"], "catalog" | "active"> },
	datagrams: Getter<boolean>,
): ConsumedExtras {
	const location = locationFields();
	// Only the peer names its handle; a local one would send moves to a window that never applies them.
	location.window.handle.set(undefined);
	const chat = chatFields();
	const signals = new Effect();

	// Each track name is its own computed, so a catalog update that leaves it alone (a camera toggle)
	// keeps its subscription instead of reopening it and replaying the window.
	const hang = signals.computed((effect) => (effect.get(broadcast.out.catalog) as ExtendedCatalog | undefined)?.hang);
	const locationTrack = signals.computed((effect) => effect.get(hang)?.location?.track);
	const liveTrack = signals.computed((effect) => effect.get(hang)?.live?.track);
	const chatTrack = signals.computed((effect) => effect.get(hang)?.chat?.track);
	const messagesTrack = signals.computed((effect) => effect.get(hang)?.messages?.track);
	// Until the catalog arrives, assume a location is coming, so a participant's tile stays locked meanwhile.
	const located = new Signal(true);
	signals.run((effect) => {
		const catalog = effect.get(broadcast.out.catalog);
		located.set(catalog === undefined || effect.get(locationTrack) !== undefined);
	});
	// A broadcast advertising the window sends messages only there.
	const windowed = signals.computed((effect) => effect.get(messagesTrack) !== undefined);

	signals.run((effect) => {
		const active = effect.get(broadcast.out.active);
		const track = effect.get(locationTrack);
		effect.cleanup(() => {
			location.window.position.set(undefined);
			location.window.handle.set(undefined);
			location.window.applied.set(undefined);
			location.peers.positions.set(undefined);
		});
		if (!active || track === undefined) return;

		subscribeJson(active, track, LocationSchema, effect, (value) => {
			location.window.position.set(value.window?.position);
			location.window.handle.set(value.window?.handle);
			location.window.applied.set(value.window?.applied);
			location.peers.positions.set(value.peers?.positions);
		});
	});

	signals.run((effect) => {
		const active = effect.get(broadcast.out.active);
		const track = effect.get(liveTrack);
		const enabled = effect.get(datagrams);
		effect.cleanup(() => clearLive(location.live));
		if (!active || track === undefined || !enabled) return;

		subscribeLive(active, track, effect, location.live);
	});

	signals.run((effect) => {
		const active = effect.get(broadcast.out.active);
		const track = effect.get(chatTrack);
		const legacy = !effect.get(windowed);
		effect.cleanup(() => {
			if (legacy) chat.message.latest.set(undefined);
			chat.typing.active.set(undefined);
		});
		if (!active || track === undefined) return;

		subscribeJson(active, track, ChatSchema, effect, (value) => {
			if (legacy) chat.message.latest.set(value.message);
			chat.typing.active.set(value.typing);
		});
	});

	signals.run((effect) => {
		const active = effect.get(broadcast.out.active);
		const track = effect.get(messagesTrack);
		effect.cleanup(() => chat.message.latest.set(undefined));
		if (!active || track === undefined) return;

		subscribeMessages(active, track, effect, chat.message.latest);
	});

	return {
		location,
		located,
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
	const consumer = new Json.Snapshot.Consumer<T>({ track: broadcast.track(name), schema, priority: PRIORITY });
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

function clearLive(live: LocationFields["live"]) {
	live.cursor.set(undefined);
	live.window.set(undefined);
	live.peer.set(undefined);
}

/**
 * Feed each live datagram on `name` to `live`, clearing it once the sender goes quiet.
 *
 * Unlike {@link subscribeJson}, a datagram that does not match is dropped rather than ending the
 * subscription: each one stands alone, so one bad datagram from a peer must not silence its later ones.
 */
function subscribeLive(
	broadcast: Moq.Broadcast.Consumer,
	name: string,
	effect: Effect,
	live: LocationFields["live"],
): void {
	const consumer = broadcast.datagrams(name);
	effect.cleanup(() => consumer.close());

	// Bumped per datagram, restarting the expiry.
	const heard = new Signal(0);
	effect.run((effect) => {
		if (effect.get(heard) === 0) return;
		effect.timer(() => clearLive(live), LIVE_EXPIRY);
	});

	effect.spawn(async () => {
		const decoder = new TextDecoder();
		// Datagrams arrive in any order, and a stale one could revive a drag its sender released.
		let latest: bigint | undefined;
		let warned = false;
		try {
			for (;;) {
				const datagram = await effect.race(consumer.recv());
				if (!datagram) break;
				if (latest !== undefined && datagram.sequence <= latest) continue;
				const value = parseLive(decoder.decode(datagram.payload));
				if (!value) {
					// Once per subscription, so a peer sending garbage at frame rate cannot flood the console.
					if (!warned) console.warn(`dropping malformed datagrams on ${name}`);
					warned = true;
					// Leaves `latest` alone, so a dropped datagram cannot shadow a valid one still in flight.
					continue;
				}
				latest = datagram.sequence;
				live.cursor.set(value.cursor);
				live.window.set(value.window);
				live.peer.set(value.peer);
				heard.update((count) => count + 1);
			}
		} finally {
			consumer.close();
		}
	});
}

function parseLive(text: string): LiveValue | undefined {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return undefined;
	}
	const result = LiveSchema.safeParse(json);
	return result.success ? result.data : undefined;
}

// Groups the publisher ended early rather than failed; the next group restates the window.
const WINDOW_GAPS: Moq.StreamCode[] = [
	Moq.StreamCode.TooFarBehind,
	Moq.StreamCode.Old,
	Moq.StreamCode.Evicted,
	Moq.StreamCode.GroupTooLarge,
];

// Resolves once the event loop has run every microtask queued so far.
const nextTask = () => Clock.yieldNow().then(() => true as const);

/**
 * Show each message the window on `name` pushes, in order, clearing it once it leaves.
 *
 * Reads frames rather than `Chat.Subscriber` events: a late joiner's first frame restates up to ten
 * seconds of history, and only its newest record may run, or a superseded meme command would play.
 * A later frame that restates several unseen records, after a delivery gap, runs every one of them.
 */
function subscribeMessages(
	broadcast: Moq.Broadcast.Consumer,
	name: string,
	effect: Effect,
	latest: Signal<string | undefined>,
): void {
	const track = broadcast.track(name).subscribe();
	effect.cleanup(() => track.close());
	effect.spawn(async () => {
		const decoder = new Json.Window.Decoder<unknown>();
		let shown: number | undefined;
		// Only the first frame restates history this viewer never watched live.
		let joined = false;
		try {
			// Start at the newest window instead of replaying older ones.
			const largest = await effect.race(track.largest());
			if (largest) track.withRange({ start: { included: largest.group } });
			const ordered = track.ordered();

			for (;;) {
				const group = await effect.race(ordered.nextGroup());
				if (!group) break;
				const codec = decoder.group();

				for (;;) {
					let frame: Moq.Group.Frame | undefined;
					try {
						frame = await effect.race(group.readFrame());
					} catch (err) {
						if (err instanceof Moq.Error.Stream && WINDOW_GAPS.includes(err.code)) break;
						throw err;
					}
					if (!frame) break;
					codec.decode(frame.payload);

					const pushed: { index: number; value: string }[] = [];
					for (let event = decoder.next(); event; event = decoder.next()) {
						if ("push" in event) {
							if (typeof event.push.value !== "string") throw new Error("chat record must be a string");
							pushed.push({ index: event.push.index, value: event.push.value });
						} else if ("pop" in event) {
							while (pushed[0] && pushed[0].index < event.pop.end) pushed.shift();
							if (shown !== undefined && shown < event.pop.end) {
								shown = undefined;
								latest.set(undefined);
							}
						}
					}
					if (!joined) pushed.splice(0, pushed.length - 1);
					joined = true;

					for (const [i, record] of pushed.entries()) {
						// Signals coalesce writes, so let readers see each command before the next one,
						// as they would had each arrived in its own packet.
						if (i > 0 && !(await effect.race(nextTask()))) return;
						shown = record.index;
						// Forced, so the same text sent twice still shows twice.
						latest.set(record.value, true);
					}
				}
			}
		} finally {
			track.close();
		}
	});
}
