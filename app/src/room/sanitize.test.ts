import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import { avatar, sanitizer } from "./sanitize";

// happy-dom's NodeIterator stops at the first removed node, so DOMPurify would pass anything after it.
// jsdom follows the spec, as browsers do.
const dom = new JSDOM("").window;
const sanitize = sanitizer(dom as unknown as Window & typeof globalThis);

function render(markdown: string): HTMLSpanElement {
	const span = dom.document.createElement("span");
	span.appendChild(sanitize(marked.parse(markdown, { async: false })));
	return span as unknown as HTMLSpanElement;
}

test("chat loads nothing that would reveal a reader's IP address", () => {
	for (const markdown of [
		"![x](https://evil.example/pixel.png)",
		'<img src="https://evil.example/pixel.png">',
		'<picture><source srcset="https://evil.example/a.png"></picture>',
		'<video src="https://evil.example/v.mp4" poster="https://evil.example/p.png"></video>',
		'<audio src="https://evil.example/a.mp3"></audio>',
		'<iframe src="https://evil.example/"></iframe>',
		'<svg><image href="https://evil.example/a.png"/></svg>',
		'<input type="image" src="https://evil.example/a.png">',
		'<span style="background:url(https://evil.example/a.png)">hi</span>',
		'<link rel="stylesheet" href="https://evil.example/a.css">',
		'<a href="https://example.com" ping="https://evil.example/ping">x</a>',
	]) {
		const html = render(markdown).innerHTML;
		expect(html).not.toContain("evil.example");
	}
});

test("links open safely in a new tab whatever the peer asked for", () => {
	const link = render('<a href="https://example.com" target="_self" rel="opener">x</a>').querySelector("a");
	expect(link?.getAttribute("href")).toBe("https://example.com");
	expect(link?.getAttribute("target")).toBe("_blank");
	expect(link?.getAttribute("rel")).toBe("noopener noreferrer");

	const markdown = render("[docs](https://example.com/docs)").querySelector("a");
	expect(markdown?.getAttribute("target")).toBe("_blank");
	expect(markdown?.getAttribute("rel")).toBe("noopener noreferrer");
});

test("only web and mail link schemes survive", () => {
	for (const href of [
		"javascript:alert(1)",
		"JaVaScRiPt:alert(1)",
		"data:text/html,<script>",
		"vbscript:x",
		"/room",
		"hang://x",
	]) {
		const link = render(`<a href="${href}">x</a>`).querySelector("a");
		expect(link?.hasAttribute("href")).toBe(false);
		expect(link?.hasAttribute("target")).toBe(false);
	}
	expect(render('<a href="mailto:a@example.com">x</a>').querySelector("a")?.getAttribute("href")).toBe(
		"mailto:a@example.com",
	);
});

test("scripts and handlers are stripped while formatting stays", () => {
	const html = render('**bold** _em_ `code` <script>alert(1)</script><b onclick="alert(1)">b</b>').innerHTML;
	expect(html).toContain("<strong>bold</strong>");
	expect(html).toContain("<em>em</em>");
	expect(html).toContain("<code>code</code>");
	expect(html).not.toContain("script");
	expect(html).not.toContain("onclick");
});

test("peer avatars load only from the app or the public bucket", () => {
	const origins = { app: "https://hang.test/room/abc", public: "https://public.hang.test" };
	for (const ok of [
		"/avatar/12.svg",
		"https://hang.test/avatar/kixel.svg",
		"https://public.hang.test/avatar/0b6e7c1e-3c55-4c4e-9f1c-0c3f6a2b9d10.png",
	]) {
		expect(avatar(ok, origins)).toBe(true);
	}
	for (const bad of [
		"https://evil.example/pixel.png",
		"//evil.example/avatar/1.svg",
		"https://cdn.discordapp.com/avatars/1/abc.png",
		"https://lh3.googleusercontent.com/a/abc=s96-c",
		"https://public.hang.test.evil.example/avatar/1.png",
		"https://public.hang.test@evil.example/avatar/1.png",
		"https://public.hang.test/avatar/../../evil.png",
		"https://public.hang.test/other/1.png",
		"http://public.hang.test/avatar/1.png",
		"http://hang.test/avatar/1.svg",
		"data:image/svg+xml,<svg/>",
		"javascript:alert(1)",
		"http://[",
	]) {
		expect(avatar(bad, origins)).toBe(false);
	}

	// A bucket served under a path, as the API does locally.
	const local = { app: "http://localhost:1420/", public: "http://localhost:3000/public" };
	expect(avatar("http://localhost:3000/public/avatar/a.png", local)).toBe(true);
	expect(avatar("http://localhost:3000/account/info", local)).toBe(false);
});
