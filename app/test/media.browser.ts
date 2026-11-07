import { expect, test } from "bun:test";
import * as Fs from "node:fs/promises";
import * as Net from "node:net";
import * as Path from "node:path";
import * as Playwright from "playwright";
import * as Vite from "vite";

type Kind = "camera" | "microphone";
const app = Path.resolve(import.meta.dir, "..");
const root = Path.resolve(app, "..");

async function port(): Promise<number> {
	const server = Net.createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing test port");
	await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	return address.port;
}

test("input controls recover capture and remote decoded media", async () => {
	await Fs.mkdir(Path.join(root, ".tmp"), { recursive: true });
	const scratch = await Fs.mkdtemp(Path.join(root, ".tmp/media-"));
	const relayPort = await port();
	const relay = Bun.spawn(
		[
			"moq-relay",
			"--listen",
			"127.0.0.1:0",
			"--listen-tls-generate",
			"localhost",
			"--web-http-listen",
			`127.0.0.1:${relayPort}`,
			"--auth-public",
			"**",
			"--drain-timeout",
			"0s",
		],
		{ stdout: Bun.file(Path.join(scratch, "relay.log")), stderr: Bun.file(Path.join(scratch, "relay.log")) },
	);
	let server: Vite.ViteDevServer | undefined;
	let browser: Playwright.Browser | undefined;
	try {
		server = await Vite.createServer({
			root: app,
			configFile: Path.join(app, "vite.config.ts"),
			server: { host: "127.0.0.1", port: 0, strictPort: false, open: false },
		});
		await server.listen();
		browser = await Playwright.chromium.launch({
			channel: "chromium",
			headless: true,
			args: [
				"--use-fake-device-for-media-stream",
				"--use-fake-ui-for-media-stream",
				"--autoplay-policy=no-user-gesture-required",
			],
		});
		const publisher = await browser.newPage();
		const viewer = await browser.newPage();
		const errors: string[] = [];
		for (const page of [publisher, viewer]) page.on("pageerror", (error) => errors.push(error.message));
		const url = new URL("test/media.html", server.resolvedUrls?.local[0]);
		url.searchParams.set("relay", `ws://127.0.0.1:${relayPort}`);
		await publisher.goto(url.href);
		url.searchParams.set("viewer", "");
		await viewer.goto(url.href);
		await Promise.all([publisher, viewer].map((page) => page.waitForFunction(() => window.mediaTest)));
		const control = (kind: Kind) => publisher.getByRole("switch", { name: `Toggle ${kind}`, exact: true });
		const live = async (kind: Kind) => {
			await publisher.waitForFunction((kind) => !!window.mediaTest.state()[kind], kind);
			expect(await control(kind).getAttribute("data-state")).toBe("live");
		};
		const off = async (kind: Kind) => {
			await control(kind).click();
			await publisher.waitForFunction((kind) => !window.mediaTest.state()[kind], kind);
			expect(await control(kind).getAttribute("aria-checked")).toBe("false");
		};
		const decoded = async (kind: Kind) => {
			const before = await viewer.evaluate(() => window.mediaTest.state());
			await viewer.waitForFunction(
				({ kind, before }) => {
					const state = window.mediaTest.state();
					return kind === "camera"
						? (state.video ?? 0) > (before.video ?? 0) + 100 &&
								(state.videoFrames ?? 0) > (before.videoFrames ?? 0)
						: (state.audio ?? 0) > (before.audio ?? 0) + 100 &&
								(state.audioBytes ?? 0) > (before.audioBytes ?? 0) &&
								state.rms > 0.001;
				},
				{ kind, before },
				{ timeout: 15_000 },
			);
		};
		for (let cycle = 0; cycle < 3; cycle++) {
			for (const kind of ["camera", "microphone"] as const) {
				await control(kind).click();
				await live(kind);
			}
			await decoded("camera");
			await decoded("microphone");
			for (const kind of ["camera", "microphone"] as const) await off(kind);
			await publisher.waitForFunction(() => window.mediaTest.state().liveTracks === 0);
		}
		for (const kind of ["camera", "microphone"] as const) {
			// New intent must win even when the old browser permission request never settles.
			await publisher.evaluate((kind) => window.mediaTest.mode(kind, "hold"), kind);
			await control(kind).click();
			await publisher.waitForFunction(() => window.mediaTest.state().held === 1);
			expect(await control(kind).getAttribute("data-state")).toBe("pending");
			await off(kind);
			await control(kind).click();
			await live(kind);
			await decoded(kind);
			await publisher.evaluate(() => window.mediaTest.release());
			await publisher.waitForFunction(() => window.mediaTest.state().liveTracks === 1);
			await off(kind);
			// A terminal refusal has an explicit retry without a reload or a two-click reset.
			await publisher.evaluate((kind) => window.mediaTest.mode(kind, "deny"), kind);
			await control(kind).click();
			const retry = publisher.getByRole("button", { name: `Retry ${kind}`, exact: true });
			await retry.waitFor({ state: "visible" });
			expect(await control(kind).getAttribute("data-state")).toBe("failed");
			await retry.click();
			await live(kind);
			await decoded(kind);
			// Switching between browser selection and an explicit device restarts capture too.
			const previous = await publisher.evaluate((kind) => window.mediaTest.state()[kind], kind);
			await publisher.evaluate((kind) => window.mediaTest.choose(kind), kind);
			await publisher.waitForFunction(
				({ kind, previous }) => {
					const track = window.mediaTest.state()[kind];
					return track && track !== previous;
				},
				{ kind, previous },
			);
			await decoded(kind);
			// Device loss opens a fresh track and the existing remote decoder follows it.
			const before = await publisher.evaluate((kind) => window.mediaTest.state()[kind], kind);
			await publisher.evaluate((kind) => window.mediaTest.end(kind), kind);
			await publisher.waitForFunction(
				({ kind, before }) => {
					const track = window.mediaTest.state()[kind];
					return track && track !== before;
				},
				{ kind, before },
			);
			await decoded(kind);
			await off(kind);
		}
		for (const kind of ["camera", "microphone"] as const) {
			await publisher.evaluate((kind) => window.mediaTest.mode(kind, "hold"), kind);
			await control(kind).click();
		}
		await publisher.waitForFunction(() => window.mediaTest.state().held === 2);
		await publisher.evaluate(() => {
			window.mediaTest.close();
			window.mediaTest.release();
		});
		await publisher.waitForFunction(() => window.mediaTest.state().liveTracks === 0);
		const final = await viewer.evaluate(() => window.mediaTest.state());
		expect(final.videoError).toBeUndefined();
		expect(final.audioError).toBeUndefined();
		await viewer.evaluate(() => window.mediaTest.close());
		expect(errors).toEqual([]);
	} finally {
		await browser?.close();
		await server?.close();
		relay.kill();
		await relay.exited;
	}
}, 90_000);
