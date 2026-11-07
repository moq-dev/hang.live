import { afterEach, expect, mock, test } from "bun:test";

mock.module("../tauri", () => ({ Api: null }));
const { Badge } = await import("./badge");
const setDescriptor = Object.getOwnPropertyDescriptor(navigator, "setAppBadge");
const clearDescriptor = Object.getOwnPropertyDescriptor(navigator, "clearAppBadge");
let badge: InstanceType<typeof Badge> | undefined;

async function flush() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
}

afterEach(async () => {
	badge?.close();
	badge = undefined;
	await flush();
	if (setDescriptor) Object.defineProperty(navigator, "setAppBadge", setDescriptor);
	else Reflect.deleteProperty(navigator, "setAppBadge");
	if (clearDescriptor) Object.defineProperty(navigator, "clearAppBadge", clearDescriptor);
	else Reflect.deleteProperty(navigator, "clearAppBadge");
});

test("closing a badge clears it after its pending update and before a new owner's update", async () => {
	const calls: (number | "clear")[] = [];
	let release: (() => void) | undefined;
	Object.defineProperty(navigator, "setAppBadge", {
		configurable: true,
		value: async (count: number) => {
			calls.push(count);
			if (count === 2)
				await new Promise<void>((resolve) => {
					release = resolve;
				});
		},
	});
	Object.defineProperty(navigator, "clearAppBadge", {
		configurable: true,
		value: async () => {
			calls.push("clear");
		},
	});
	badge = new Badge();
	badge.set(2);
	await flush();
	expect(calls).toEqual([2]);
	badge.close();
	badge = new Badge();
	badge.set(1);
	await flush();
	expect(calls).toEqual([2]);
	if (!release) throw new Error("Missing pending badge operation");
	release();
	await flush();
	expect(calls).toEqual([2, "clear", 1]);
	badge.close();
	await flush();
	expect(calls).toEqual([2, "clear", 1, "clear"]);
});
