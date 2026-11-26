import { expect, test } from "bun:test";
import * as Json from "@moq/json";
import * as Net from "@moq/net";
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
