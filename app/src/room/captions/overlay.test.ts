import { expect, test } from "bun:test";
import type * as Catalog from "@moq/hang/catalog";
import { pick } from "./overlay";

const track = (lang: string | undefined, format = "utf8"): Catalog.TextConfig => ({
	format,
	role: "caption",
	lang,
	container: { kind: "legacy" },
});

const both = { "captions/es": track("es"), "captions/en": track("en") };

test.each([
	["en-US", "captions/en"],
	["es", "captions/es"],
	["ES-419", "captions/es"],
	// Nothing in the reader's language still shows captions rather than none.
	["fr", "captions/en"],
])("a %s reader of a translated speaker sees %s", (language, expected) => {
	expect(pick(both, language)).toBe(expected);
});

test("an exact region match beats the base language", () => {
	expect(pick({ a: track("pt"), b: track("pt-BR") }, "pt-BR")).toBe("b");
});

test("tracks the renderer can't display are never picked", () => {
	expect(pick({ "captions/en": track("en", "ttml") }, "en")).toBeUndefined();
	expect(pick({ a: track("en", "ttml"), b: track(undefined) }, "en")).toBe("b");
});

test("no tracks picks nothing", () => {
	expect(pick({}, "en")).toBeUndefined();
});
