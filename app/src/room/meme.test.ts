import { expect, test } from "bun:test";
import { load } from "./meme";

// Peers pick the command name, so inherited object keys must fall through to plain chat.
test("chat commands match only registered memes", () => {
	for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "nope"]) {
		expect(load(name)).toBeUndefined();
	}
});
