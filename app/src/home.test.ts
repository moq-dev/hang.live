import { afterEach, expect, mock, test } from "bun:test";
import * as Json from "@moq/json";
import * as Moq from "@moq/net";
import { Signal } from "@moq/signals";
import type { JSX } from "solid-js";
import { render } from "solid-js/web";

// Exercise the real Home, favorite cards, and preview rosters without API or relay I/O.
const origin = new Moq.Origin.Producer();
const connection = new Moq.Connection({ enabled: false });
Object.defineProperty(connection, "origin", { value: new Signal(origin) });
const authenticated = new Signal(true);
let favorites = [
	{ room: "room", created_at: 0 },
	{ room: "roommate", created_at: 0 },
];
const badgeCounts: (number | undefined)[] = [];
Object.defineProperty(navigator, "setAppBadge", {
	configurable: true,
	value: async (count?: number) => {
		badgeCounts.push(count);
	},
});
const clearBadge = mock(async () => {
	badgeCounts.push(undefined);
});
Object.defineProperty(navigator, "clearAppBadge", {
	configurable: true,
	value: clearBadge,
});

mock.module("./api", () => ({
	client: {
		authenticated,
		routes: {
			fave: {
				all: { $get: async () => ({ ok: true, json: async () => ({ favorites }) }) },
				":room": {
					remove: {
						$post: async ({ param }: { param: { room: string } }) => {
							favorites = favorites.filter((favorite) => favorite.room !== param.room);
							return { ok: true };
						},
					},
				},
			},
		},
	},
}));
mock.module("./components/create", () => ({ default: () => null }));
mock.module("./components/login", () => ({ default: () => null }));
mock.module("./components/profile", () => ({ default: () => null }));
mock.module("./layout/web", () => ({ default: (props: { children: JSX.Element }) => props.children }));
mock.module("./room/local", () => ({
	Local: class {
		close() {}
	},
}));
mock.module("./tauri", () => ({ Api: null }));
mock.module("../../moq/js/watch/src/audio/render-worklet.ts?worklet", () => ({
	default: async () => "blob:fake-render",
}));
mock.module("../../moq/js/publish/src/audio/capture-worklet.ts?worklet", () => ({
	default: async () => "blob:fake-capture",
}));
mock.module("../../moq/js/publish/src/video/capture-worker.ts?worklet", () => ({
	default: async () => "blob:fake-worker",
}));

// Keep a real Connection (and its complete type), but supply the in-memory origin.
const originalConnection = Moq.Connection;
mock.module("@moq/net", () => ({
	...Moq,
	Connection: class extends originalConnection {
		constructor() {
			super({ enabled: false });
			Object.defineProperty(this, "origin", { value: connection.origin });
		}
	},
}));
const { Home } = await import("./home");

// MoQ notifications and Solid resource/effect work settle through microtasks.
async function flush() {
	for (let i = 0; i < 50; i++) await Promise.resolve();
}

const routes: Moq.Origin.Route[] = [];
const catalogs: Json.Snapshot.Producer<object>[] = [];
function announce(path: string): Moq.Origin.Route {
	const route = origin.route(Moq.Path.from(path), { hidden: true });
	const catalog = new Json.Snapshot.Producer<object>({ track: route.broadcast.createTrack("catalog.json") });
	catalog.update({ value: {} });
	catalogs.push(catalog);
	routes.push(route);
	route.announce();
	return route;
}
let dispose: (() => void) | undefined;
afterEach(async () => {
	dispose?.();
	dispose = undefined;
	for (const catalog of catalogs) catalog.finish();
	for (const route of routes) route.close();
	origin.close();
	connection.close();
	await flush();
	document.body.replaceChildren();
});

test("favorites scope sibling rooms and balance the badge through joins, leaves, removal, and disposal", async () => {
	const element = document.createElement("div");
	document.body.append(element);
	dispose = render(Home, element);
	await flush();
	const roomRoute = announce("room/alice/camera.hang");
	await flush();
	const cards = () => [...element.querySelectorAll("a[href^='/@']")].map((link) => link.parentElement?.parentElement);
	const counts = () => cards().map((card) => card?.querySelector("span.text-gray-400")?.textContent ?? "0");
	expect(counts()).toEqual(["1", "0"]);
	expect(badgeCounts.at(-1)).toBe(1);

	announce("roommate/bob/camera.hang");
	await flush();
	expect(counts()).toEqual(["1", "1"]);
	expect(badgeCounts.at(-1)).toBe(2);

	roomRoute.close();
	await flush();
	expect(counts()).toEqual(["0", "1"]);
	expect(badgeCounts.at(-1)).toBe(1);

	const remove = cards()[1]?.querySelector("button");
	if (!remove) throw new Error("Missing favorite remove button");
	remove.click();
	await flush();
	expect(cards()).toHaveLength(1);
	expect(badgeCounts.at(-1)).toBeUndefined();
	expect(clearBadge).toHaveBeenCalled();

	announce("room/carol/camera.hang");
	await flush();
	expect(badgeCounts.at(-1)).toBe(1);
	dispose();
	dispose = undefined;
	await flush();
	expect(badgeCounts.at(-1)).toBeUndefined();
});
