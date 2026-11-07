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
		const track = net.consume().track("hang/location.json").subscribe();
		const consumer = new Json.Snapshot.Consumer<{ window: { position?: { x: number } } }>(track);
		await consumer.next();
		location.window.position.set({ x: 1 });
		await flush();
		expect((await consumer.next())?.window.position).toEqual({ x: 1 });
		track.close();
	} finally {
		effect.close();
		net.close();
	}
});

test("removed chat catalog entries clear stale messages", async () => {
	const net = new Net.Broadcast.Producer();
	const catalog = new Signal<ExtendedCatalog | undefined>({ hang: { chat: { track: "hang/chat.json" } } });
	const active = new Signal<Net.Broadcast.Consumer | undefined>(net.consume());
	const publisher = new Json.Snapshot.Producer({ track: net.createTrack("hang/chat.json") });
	publisher.update({ message: "hello", typing: true });
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
