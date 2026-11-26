import { describe, expect, test } from "bun:test";
import { redirect } from "./deep_link";

const ORIGINS = ["tauri://localhost", "http://tauri.localhost"];

describe("redirect", () => {
	for (const origin of ORIGINS) {
		test(`keeps the hang:// host as the first path segment (${origin})`, () => {
			expect(redirect("hang://oauth/home?token=a&random=b", origin)).toBe("/oauth/home?token=a&random=b");
			expect(redirect("hang://about", origin)).toBe("/about");
		});

		test(`uses the localhost OAuth path (${origin})`, () => {
			expect(redirect("http://localhost:8000/oauth/home?token=a", origin)).toBe("/oauth/home?token=a");
			expect(redirect("http://127.0.0.1:8000/oauth/@room?token=a", origin)).toBe("/oauth/@room?token=a");
		});

		test(`rejects paths that leave the app (${origin})`, () => {
			expect(() => redirect("hang:///evil.com/x", origin)).toThrow();
			expect(() => redirect("http://localhost:8000//evil.com/x", origin)).toThrow();
			expect(() => redirect("http://localhost:8000/\\evil.com/x", origin)).toThrow();
			expect(() => redirect("http://localhost:8000/a/..//evil.com/x", origin)).toThrow();
		});

		test(`rejects other schemes and hosts (${origin})`, () => {
			expect(() => redirect("https://evil.com/oauth/home", origin)).toThrow();
			expect(() => redirect("http://evil.com/oauth/home", origin)).toThrow();
			expect(() => redirect("javascript:alert(1)", origin)).toThrow();
		});
	}
});
