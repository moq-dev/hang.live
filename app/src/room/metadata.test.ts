import { expect, test } from "bun:test";
import * as Clock from "@moq/clock";
import { Manual } from "@moq/clock/test";
import * as Json from "@moq/json";
import * as Net from "@moq/net";
import { Chat } from "@moq/room";
import { Effect, Signal } from "@moq/signals";
import { chatFields, consumeExtras, type ExtendedCatalog, locationFields, serveExtras } from "./metadata";

async function flush() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
}

test("location edits keep an existing subscription alive", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({});
	const location = locationFields();
	const effect = new Effect();
	try {
		serveExtras(
			{ net: new Signal<Net.Broadcast.Producer | undefined>(net), catalog },
			location,
			chatFields(),
			effect,
		);
		await flush();
		const broadcast = net.consume();
		const consumer = new Json.Snapshot.Consumer<{ window: { position?: { x: number } } }>({
			track: broadcast.track("hang/location.json"),
		});
		await consumer.next();
		location.window.position.set({ x: 1 });
		await flush();
		expect((await consumer.next())?.value.window.position).toEqual({ x: 1 });
		consumer.close();
		broadcast.close();
	} finally {
		effect.close();
		net.close();
	}
});

test("a watched window stays locked until its location arrives", () => {
	const extras = consumeExtras(
		{
			out: {
				catalog: new Signal<ExtendedCatalog>({}),
				active: new Signal<Net.Broadcast.Consumer | undefined>(undefined),
			},
		},
		new Signal(true),
	);
	try {
		expect(extras.location.window.handle.peek()).toBeUndefined();
	} finally {
		extras.close();
	}
});

test("a window peers may not move hides its handle and echoes from them", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({});
	const local = locationFields();
	local.window.handle.set("h1");
	const effect = new Effect();
	serveExtras({ net: new Signal<Net.Broadcast.Producer | undefined>(net), catalog }, local, chatFields(), effect);
	const extras = consumeExtras(
		{
			out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
		},
		new Signal(true),
	);
	try {
		local.peers.positions.set({ peer: { x: 0.5, id: "m1" } });
		await flush();
		expect(extras.location.window.handle.peek()).toBe(local.window.handle.peek());
		// An empty list still tells peers to wait for the echo.
		expect(extras.location.window.applied.peek()).toEqual([]);
		expect(extras.location.peers.positions.peek()).toEqual({ peer: { x: 0.5, id: "m1" } });

		local.window.movable.set(false);
		await flush();
		expect(extras.location.window.handle.peek()).toBeUndefined();
		expect(extras.location.window.applied.peek()).toBeUndefined();
		// Asking others to move doesn't depend on it.
		expect(extras.location.peers.positions.peek()).toEqual({ peer: { x: 0.5, id: "m1" } });
	} finally {
		extras.close();
		effect.close();
		net.close();
	}
});

test("removed chat catalog entries clear stale messages", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog | undefined>({ hang: { chat: { track: "hang/chat.json" } } });
	const active = new Signal<Net.Broadcast.Consumer | undefined>(net.consume());
	const track = net.createTrack("hang/chat.json", { timescale: Net.Time.Timescale.MILLI });
	if (!track) throw new Error("hang/chat.json already exists");
	const publisher = new Json.Snapshot.Producer({ track });
	publisher.update({ message: "hello", typing: true }, Net.Time.Timestamp.now());
	const extras = consumeExtras({ out: { catalog, active } }, new Signal(true));
	try {
		await flush();
		expect(extras.chat.message.latest.peek()).toBe("hello");
		catalog.set({});
		await flush();
		expect(extras.chat.message.latest.peek()).toBeUndefined();
		expect(extras.chat.typing.active.peek()).toBeUndefined();
	} finally {
		extras.close();
		publisher.finish();
		net.close();
	}
});

test("windowed chat delivers a repeated message twice and ignores the legacy field", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({});
	const local = chatFields();
	const effect = new Effect();
	serveExtras({ net: new Signal<Net.Broadcast.Producer | undefined>(net), catalog }, locationFields(), local, effect);
	const extras = consumeExtras(
		{
			out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
		},
		new Signal(true),
	);
	const seen: (string | undefined)[] = [];
	const dispose = extras.chat.message.latest.subscribe((value) => seen.push(value));
	try {
		await flush();
		local.message.latest.set("lol", true);
		await flush();
		local.message.latest.set("lol", true);
		await flush();
		// The legacy snapshot clears its message, which a windowed reader must not follow.
		local.message.latest.set("");
		await flush();
		expect(seen.filter((value) => value === "lol")).toHaveLength(2);
		expect(extras.chat.message.latest.peek()).toBe("lol");

		// An unrelated catalog edit, such as a camera toggle, must not reopen the window and replay it.
		catalog.update((prev) => ({ ...prev, version: (prev.version ?? 0) + 1 }));
		await flush();
		expect(seen.filter((value) => value === "lol")).toHaveLength(2);
	} finally {
		dispose();
		extras.close();
		effect.close();
		net.close();
	}
});

test("a malformed location never reaches the UI", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog | undefined>({ hang: { location: { track: "hang/location.json" } } });
	const track = net.createTrack("hang/location.json", { timescale: Net.Time.Timescale.MILLI });
	if (!track) throw new Error("hang/location.json already exists");
	const publisher = new Json.Snapshot.Producer({ track });
	publisher.update({ window: { position: { x: "left" } } }, Net.Time.Timestamp.now());
	const extras = consumeExtras(
		{
			out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
		},
		new Signal(true),
	);
	try {
		await flush();
		expect(extras.location.window.position.peek()).toBeUndefined();
	} finally {
		extras.close();
		publisher.finish();
		net.close();
	}
});

test("a late joiner applies only the newest retained chat message", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({});
	const local = chatFields();
	const effect = new Effect();
	serveExtras({ net: new Signal<Net.Broadcast.Producer | undefined>(net), catalog }, locationFields(), local, effect);
	try {
		await flush();
		for (const text of ["hi", "/huh", "bye"]) {
			local.message.latest.set(text, true);
			await flush();
		}

		const extras = consumeExtras(
			{
				out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
			},
			new Signal(true),
		);
		// Watch it the way the meme effect does, so a superseded `/huh` would play here.
		const seen: string[] = [];
		const watcher = new Effect();
		watcher.run((effect) => {
			const msg = effect.get(extras.chat.message.latest);
			if (msg) seen.push(msg);
		});
		try {
			await flush();
			expect(seen).toEqual(["bye"]);

			local.message.latest.set("again", true);
			await flush();
			expect(seen).toEqual(["bye", "again"]);
		} finally {
			watcher.close();
			extras.close();
		}
	} finally {
		effect.close();
		net.close();
	}
});

test("a watcher recovers every chat message a delivery gap skipped", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({ hang: { messages: { track: Chat.TRACK } } });
	const track = net.createTrack(Chat.TRACK, Chat.info());
	if (!track) throw new Error(`${Chat.TRACK} already exists`);
	// One group per header, each at its own millisecond.
	const write = (ms: number, records: string[]) => {
		const timestamp = Net.Time.Timestamp.fromMillis(ms);
		const group = track.appendGroup(timestamp);
		group.writeFrame({ payload: new TextEncoder().encode(JSON.stringify({ offset: 0, records })), timestamp });
		return group;
	};

	const group = write(1, ["hi"]);
	const extras = consumeExtras(
		{
			out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
		},
		new Signal(true),
	);
	// Watch it the way the meme effect does, so a dropped `/huh` would never play here.
	const seen: string[] = [];
	const watcher = new Effect();
	watcher.run((effect) => {
		const msg = effect.get(extras.chat.message.latest);
		if (msg) seen.push(msg);
	});
	try {
		await flush();
		expect(seen).toEqual(["hi"]);

		// The group carrying `/huh` never arrives; the next one restates it beside `bye`.
		group.abort(new Net.Error.Stream(Net.StreamCode.TooFarBehind));
		write(2, ["hi", "/huh", "bye"]);
		// One event-loop turn per recovered record, the yield the reader takes between them.
		for (let i = 0; i < 3; i++) {
			await Clock.yieldNow();
			await flush();
		}
		expect(seen).toEqual(["hi", "/huh", "bye"]);
	} finally {
		watcher.close();
		extras.close();
		track.close();
		net.close();
	}
});

test("a broadcast without Hang's location, as OBS publishes, is placed locally", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog | undefined>(undefined);
	const extras = consumeExtras(
		{ out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) } },
		new Signal(true),
	);
	try {
		// Locked until the catalog says whether a location is coming.
		await flush();
		expect(extras.located.peek()).toBe(true);

		// A plain `.hang` catalog: media only, no `hang` section.
		catalog.set({});
		await flush();
		expect(extras.located.peek()).toBe(false);
		expect(extras.location.window.position.peek()).toBeUndefined();
		expect(extras.location.window.handle.peek()).toBeUndefined();

		catalog.set({ hang: { location: { track: "hang/location.json" } } });
		await flush();
		expect(extras.located.peek()).toBe(true);
	} finally {
		extras.close();
		net.close();
	}
});

// Serve live state from `local` and read it back the way a watcher does, on a manual clock.
function live(datagrams = new Signal(true)) {
	const clock = new Manual();
	const installed = clock.install();
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({});
	const local = locationFields();
	const effect = new Effect();
	serveExtras({ net: new Signal<Net.Broadcast.Producer | undefined>(net), catalog }, local, chatFields(), effect);
	const extras = consumeExtras(
		{ out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) } },
		datagrams,
	);
	return {
		clock,
		local: local.live,
		remote: extras.location.live,
		stop: () => effect.close(),
		[Symbol.dispose]: () => {
			extras.close();
			effect.close();
			net.close();
			installed.close();
		},
	};
}

test("live pointers and drags stream over datagrams and clear on release", async () => {
	using room = live();
	await flush();
	room.local.cursor.set({ x: 0.1, y: -0.2 });
	room.local.peer.set({ handle: "peer", position: { x: 0.3, y: 0.4, z: 2, s: 1 } });
	await flush();
	expect(room.remote.cursor.peek()).toEqual({ x: 0.1, y: -0.2 });
	expect(room.remote.peer.peek()).toEqual({ handle: "peer", position: { x: 0.3, y: 0.4, z: 2, s: 1 } });

	// Releasing sends the empty state, so viewers drop it without waiting to expire.
	room.local.cursor.set(undefined);
	room.local.peer.set(undefined);
	await flush();
	expect(room.remote.cursor.peek()).toBeUndefined();
	expect(room.remote.peer.peek()).toBeUndefined();
});

test("a still pointer repeats, and one whose sender vanishes expires", async () => {
	using room = live();
	await flush();
	room.local.window.set({ x: 0.25, y: 0.25 });
	await flush();

	// Well past the expiry, the repeats keep it alive.
	for (let i = 0; i < 8; i++) await room.clock.advance(Clock.Duration.millis(250));
	expect(room.remote.window.peek()).toEqual({ x: 0.25, y: 0.25 });

	// A sender that stops without its empty datagram, as when its tab dies.
	room.stop();
	await room.clock.advance(Clock.Duration.millis(900));
	expect(room.remote.window.peek()).toEqual({ x: 0.25, y: 0.25 });
	await room.clock.advance(Clock.Duration.millis(200));
	expect(room.remote.window.peek()).toBeUndefined();
});

test("a transport without datagrams keeps only the snapshot", async () => {
	const datagrams = new Signal(false);
	using room = live(datagrams);
	await flush();
	room.local.cursor.set({ x: 0.1, y: 0.1 });
	await flush();
	expect(room.remote.cursor.peek()).toBeUndefined();

	// Reconnecting over WebTransport subscribes from the next datagram on.
	datagrams.set(true);
	await flush();
	await room.clock.advance(Clock.Duration.millis(250));
	expect(room.remote.cursor.peek()).toEqual({ x: 0.1, y: 0.1 });

	datagrams.set(false);
	await flush();
	expect(room.remote.cursor.peek()).toBeUndefined();
});

test("a malformed live datagram is dropped and later ones still arrive", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({ hang: { live: { track: "hang/live.json" } } });
	const track = net.createDatagrams("hang/live.json", { timescale: Net.Time.Timescale.MILLI });
	if (!track) throw new Error("hang/live.json already exists");
	const extras = consumeExtras(
		{ out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) } },
		new Signal(true),
	);
	const send = (value: unknown) =>
		track.append(Net.Time.Timestamp.now(), new TextEncoder().encode(JSON.stringify(value)));
	try {
		await flush();
		send({ cursor: { x: 0.1, y: 0.1 } });
		await flush();
		// A non-finite coordinate serializes as null.
		send({ cursor: { x: Number.NaN, y: 0 } });
		track.append(Net.Time.Timestamp.now(), new TextEncoder().encode("{not json"));
		await flush();
		expect(extras.location.live.cursor.peek()).toEqual({ x: 0.1, y: 0.1 });

		send({ cursor: { x: 0.2, y: -0.2 } });
		await flush();
		expect(extras.location.live.cursor.peek()).toEqual({ x: 0.2, y: -0.2 });
	} finally {
		extras.close();
		track.finish();
		net.close();
	}
});

test("a live datagram arriving after a newer one is ignored", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({ hang: { live: { track: "hang/live.json" } } });
	const track = net.createDatagrams("hang/live.json", { timescale: Net.Time.Timescale.MILLI });
	if (!track) throw new Error("hang/live.json already exists");
	const extras = consumeExtras(
		{ out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) } },
		new Signal(true),
	);
	const send = (sequence: bigint, value: unknown) =>
		track.insert({
			sequence,
			timestamp: Net.Time.Timestamp.now(),
			payload: new TextEncoder().encode(JSON.stringify(value)),
		});
	try {
		await flush();
		// The release overtakes the drag sent before it.
		send(2n, {});
		send(1n, { window: { x: 0.4, y: 0.4 } });
		await flush();
		expect(extras.location.live.window.peek()).toBeUndefined();

		send(3n, { window: { x: 0.1, y: 0.1 } });
		await flush();
		expect(extras.location.live.window.peek()).toEqual({ x: 0.1, y: 0.1 });
	} finally {
		extras.close();
		track.finish();
		net.close();
	}
});
