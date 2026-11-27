// Joins a deployed hang.live from two headless Chromium pages with fake cameras and checks that each
// sees the other, reading only what the shipped page shows. Run it as `just smoke <origin>`.
import * as Playwright from "playwright";

declare global {
	interface Window {
		// The count the page last put on its app badge: how many others it shows in the room.
		smokeBadge?: number;
	}
}

const target = process.argv[2];
if (!target) throw new Error("usage: bun test/smoke.ts <origin>, such as https://hang.live");
const origin = new URL(target);

// A fresh room under a prefix kept for the smoke, so neither a visitor nor an overlapping run changes who is in it.
// Rooms are not stored and guests mint only a `guest/<uuid>` path, so a run leaves nothing behind.
const room = `hang-smoke-${crypto.randomUUID()}`;
const url = new URL(`/@${room}`, origin);
const TIMEOUT = 30_000;

const errors: string[] = [];
let current = "launch Chromium";
// Each page's recent console output and what it shows, printed when a step fails.
const opened: { name: string; page: Playwright.Page; console: string[] }[] = [];

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
	current = name;
	const start = performance.now();
	const result = await run();
	if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
	console.info(`ok: ${name} (${Math.round(performance.now() - start)} ms)`);
	return result;
}

// Opens the room's join screen as a guest with a known name.
async function open(browser: Playwright.Browser, name: string): Promise<Playwright.Page> {
	// SwiftShader draws the full-page canvas on the CPU every frame; at larger sizes it starves the
	// pages on a two-core runner.
	const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
	page.setDefaultTimeout(TIMEOUT);
	const log: string[] = [];
	opened.push({ name, page, console: log });
	page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
	page.on("console", (message) => {
		// Chromium reports GL errors as WebGL console messages, and the canvas logs a throwing frame.
		if (/WebGL|render error/.test(message.text())) errors.push(`${name}: ${message.text()}`);
		if (message.type() === "debug") return;
		log.push(`${message.type()}: ${message.text()}`);
		if (log.length > 50) log.shift();
	});
	await page.addInitScript((name) => {
		// A returning guest's saved name, so the other page can tell this one apart.
		localStorage.setItem("settings.account.name", name);
		// The room puts how many others are in it on the app badge; headless Chromium has no badge to show it on.
		const badge = (count = 0) => {
			window.smokeBadge = count;
			return Promise.resolve();
		};
		Object.defineProperty(Navigator.prototype, "setAppBadge", { configurable: true, value: badge });
		Object.defineProperty(Navigator.prototype, "clearAppBadge", { configurable: true, value: () => badge(0) });
	}, name);
	await page.goto(url.href);
	return page;
}

// Turns the camera on from the join screen, then joins once the page reached the relay.
async function join(page: Playwright.Page): Promise<void> {
	await page.getByRole("switch", { name: "Toggle camera", exact: true }).click();
	await page.locator('[role="switch"][aria-label="Toggle camera"][data-state="live"]').waitFor();
	// The button stays disabled until the API granted a token and the relay connection is up.
	await page.getByRole("button", { name: "Join as Guest", exact: true }).click();
	await page.getByRole("textbox", { name: "Chat message", exact: true }).waitFor();
}

async function sees(page: Playwright.Page, others: number): Promise<void> {
	await page.waitForFunction((others) => window.smokeBadge === others, others);
}

console.info(`smoke: ${url.href}`);
const browser = await Playwright.chromium.launch({
	channel: "chromium",
	headless: true,
	args: [
		"--use-fake-device-for-media-stream",
		"--use-fake-ui-for-media-stream",
		"--autoplay-policy=no-user-gesture-required",
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
	],
});
try {
	const a = await step("A opens the room", () => open(browser, "Smoke A"));
	await step("A joins with its camera on and sees no one else", async () => {
		await join(a);
		await sees(a, 0);
	});
	const b = await step("B opens the room", () => open(browser, "Smoke B"));
	await step("B's join screen lists A", async () => {
		await b.getByRole("heading", { name: "Hanging Now (1)", exact: true }).waitFor();
		await b.getByRole("main").getByText("Smoke A", { exact: true }).waitFor();
	});
	await step("B joins with its camera on", () => join(b));
	await step("A and B each see the other in the room", async () => {
		await Promise.all([sees(a, 1), sees(b, 1)]);
	});
	console.info("smoke passed");
} catch (error) {
	console.error(`smoke failed at step "${current}" on ${url.href}`);
	console.error(error);
	for (const { name, page, console: log } of opened) {
		console.error(`\n${name} console:\n${log.join("\n")}`);
		console.error(`\n${name} shows:\n${await page.locator("body").ariaSnapshot().catch(String)}`);
	}
	process.exitCode = 1;
} finally {
	await browser.close();
}
