import { afterEach, expect, test } from "bun:test";
import * as Signals from "@moq/signals";
import * as Speaker from "./speaker";

class Storage {
	#values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.#values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.#values.set(key, value);
	}
}

const effects: Signals.Effect[] = [];

function load(storage: Storage) {
	const effect = new Signals.Effect();
	effects.push(effect);
	return Speaker.load(storage, effect);
}

afterEach(() => {
	for (const effect of effects.splice(0)) effect.close();
});

test.each([0.01, 0.75, 1.5, Speaker.VOLUME_RANGE.max])("selected gain %s survives reload", async (gain) => {
	const storage = new Storage();
	const audio = load(storage);
	audio.setVolume(gain);
	await Promise.resolve();
	expect(storage.getItem("settings.audio.volume")).toBe(gain.toString());
	const reloaded = load(storage);
	expect(reloaded.volume.peek()).toBe(gain);
	expect(reloaded.enabled.peek()).toBe(true);
});

test.each(["NaN", "Infinity", "-Infinity", "-0.01", "2.01", "1.5junk", "", " "])(
	"invalid persisted gain '%s' resets to unity",
	async (raw) => {
		const storage = new Storage();
		storage.setItem("settings.audio.volume", raw);
		const audio = load(storage);
		expect(audio.volume.peek()).toBe(1);
		expect(audio.enabled.peek()).toBe(true);
		await Promise.resolve();
		expect(storage.getItem("settings.audio.volume")).toBe("1");
	},
);

test.each(["button", "slider"])("%s mute preserves gain across reload and unmute", async (mute) => {
	const storage = new Storage();
	const audio = load(storage);
	audio.setVolume(1.7);
	if (mute === "slider") audio.setVolume(0);
	else audio.enabled.update((enabled) => !enabled);
	await Promise.resolve();
	expect(storage.getItem("settings.audio.volume")).toBe("1.7");
	expect(storage.getItem("settings.audio.enabled")).toBe("false");
	const reloaded = load(storage);
	expect(reloaded.enabled.peek()).toBe(false);
	reloaded.enabled.update((enabled) => !enabled);
	expect(reloaded.enabled.peek()).toBe(true);
	expect(reloaded.volume.peek()).toBe(1.7);
});

test("a nonzero slider change unmutes and persists the new gain", async () => {
	const storage = new Storage();
	const audio = load(storage);
	audio.setVolume(1.7);
	audio.setVolume(0);
	audio.setVolume(0.5);
	await Promise.resolve();
	const reloaded = load(storage);
	expect(reloaded.volume.peek()).toBe(0.5);
	expect(reloaded.enabled.peek()).toBe(true);
});

test("a legacy zero gain stays muted and can be unmuted audibly", () => {
	const storage = new Storage();
	storage.setItem("settings.audio.volume", "0");
	const audio = load(storage);
	expect(audio.enabled.peek()).toBe(false);
	audio.enabled.update((enabled) => !enabled);
	expect(audio.volume.peek()).toBe(1);
});
