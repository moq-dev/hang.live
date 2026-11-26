import { expect, test } from "bun:test";
import { fallbackName } from "./name";

test("a broadcast naming no user is labelled from its path", () => {
	const identity = "external/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
	expect(fallbackName(`${identity}/camera.hang`)).toBe("external/1b9d6bcd");
	expect(fallbackName(`${identity}/screen.hang`)).toBe("external/1b9d6bcd (screen)");
	// A path the room would not open still gets a label rather than an empty one.
	expect(fallbackName("obs")).toBe("obs");
});
