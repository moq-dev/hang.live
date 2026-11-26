import { expect, mock, test } from "bun:test";

// Stored values from an older build or a hand-edited profile, loaded before the module reads them.
localStorage.setItem("settings.microphone.gain", "NaN");
localStorage.setItem("settings.camera.device", "cam");
localStorage.setItem("settings.meme.tab", "video");
localStorage.setItem("settings.oauth.token", "jwt");
localStorage.setItem("settings.account.guest", "guest/alice");
localStorage.setItem("settings.account.name", "Alice");

const { Settings } = await import("./settings");

test("an unparseable microphone gain loads as unity", () => {
	expect(Settings.microphone.gain.peek()).toBe(1);
});

test("logout forgets the identity but keeps preferences", () => {
	const reload = mock(() => {});
	Object.defineProperty(window.location, "reload", { configurable: true, value: reload });

	Settings.logout();

	expect(reload).toHaveBeenCalled();
	for (const key of ["settings.oauth.token", "settings.account.guest", "settings.account.name"]) {
		expect(localStorage.getItem(key)).toBeNull();
	}
	expect(localStorage.getItem("settings.camera.device")).toBe("cam");
	expect(localStorage.getItem("settings.meme.tab")).toBe("video");
});
