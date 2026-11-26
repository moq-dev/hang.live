import { expect, test } from "bun:test";
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

test("a window peers may not move hides its handle and echoes from them", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog>({});
	const local = locationFields();
	const effect = new Effect();
	serveExtras({ net: new Signal<Net.Broadcast.Producer | undefined>(net), catalog }, local, chatFields(), effect);
	const extras = consumeExtras({
		out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
	});
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
	const extras = consumeExtras({ out: { catalog, active } });
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
	const extras = consumeExtras({
		out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
	});
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
	const extras = consumeExtras({
		out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
	});
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

		const extras = consumeExtras({
			out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
		});
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
	const extras = consumeExtras({
		out: { catalog, active: new Signal<Net.Broadcast.Consumer | undefined>(net.consume()) },
	});
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
			await new Promise((resolve) => setTimeout(resolve, 0));
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
