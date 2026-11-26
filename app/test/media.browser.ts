import * as Test from "bun:test";
import * as Path from "node:path";
import * as Process from "node:process";
import * as Util from "node:util";
import * as Playwright from "playwright";
import * as Vite from "vite";

type Kind = "camera" | "microphone";
const app = Path.resolve(import.meta.dir, "..");

function relayAddress(log: string): string | undefined {
	return /listening addr=(127\.0\.0\.1:\d+) kind="http"/.exec(Util.stripVTControlCharacters(log))?.[1];
}

Test.test("relay readiness accepts terminal styling in CI logs", () => {
	const record = 'INFO moq_relay::web: listening addr=127.0.0.1:60669 kind="http"';
	Test.expect(relayAddress(record)).toBe("127.0.0.1:60669");
	const colored = record
		.replace("addr=", "\u001b[3maddr\u001b[0m\u001b[2m=\u001b[0m")
		.replace("kind=", "\u001b[3mkind\u001b[0m\u001b[2m=\u001b[0m");
	Test.expect(relayAddress(colored)).toBe("127.0.0.1:60669");
	Test.expect(relayAddress('listening addr=127.0.0.1:444 kind="quic"')).toBeUndefined();
});

// One relay and one Vite server for every browser test.
let relay: Bun.Subprocess<"ignore", "ignore", "pipe"> | undefined;
let relayOutput: Promise<void> | undefined;
let relayLog = "";
let relayUrl = "";
let server: Vite.ViteDevServer | undefined;
let base: URL;

Test.beforeAll(async () => {
	const ready = Promise.withResolvers<string>();
	relay = Bun.spawn(
		[
			"moq-relay",
			"--listen",
			"127.0.0.1:0",
			"--listen-tls-generate",
			"localhost",
			"--web-http-listen",
			"127.0.0.1:0",
			"--auth-public=",
			"--drain-timeout",
			"0s",
		],
		{
			stdin: "ignore",
			stdout: "ignore",
			stderr: "pipe",
			env: { ...Process.env, RUST_LOG: "warn,moq_relay::web=info" },
		},
	);
	const stderr = relay.stderr;
	relayOutput = (async () => {
		try {
			const decoder = new TextDecoder();
			for await (const chunk of stderr) {
				relayLog += decoder.decode(chunk, { stream: true });
				const address = relayAddress(relayLog);
				if (address) ready.resolve(`ws://${address}`);
			}
			ready.reject(new Error(`Relay exited before listening: ${relayLog}`));
		} catch (error) {
			ready.reject(error);
		}
	})();
	const deadline = setTimeout(() => ready.reject(new Error(`Relay did not start: ${relayLog}`)), 10_000);
	try {
		relayUrl = await ready.promise;
	} finally {
		clearTimeout(deadline);
	}
	server = await Vite.createServer({
		root: app,
		configFile: Path.join(app, "vite.config.ts"),
		server: { host: "127.0.0.1", port: 0, strictPort: false, open: false },
	});
	await server.listen();
	const local = server.resolvedUrls?.local[0];
	if (!local) throw new Error("Vite did not report a local URL");
	base = new URL(local);
});

Test.afterAll(async () => {
	relay?.kill();
	const cleanup = await Promise.allSettled([server?.close(), relay?.exited, relayOutput]);
	const failures = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason);
	if (failures.length) throw new AggregateError(failures, "Browser test cleanup failed");
});

// Fake capture devices stand in for a camera and microphone.
const FAKE_MEDIA = [
	"--use-fake-device-for-media-stream",
	"--use-fake-ui-for-media-stream",
	"--autoplay-policy=no-user-gesture-required",
];

function launch(args: string[]): Promise<Playwright.Browser> {
	return Playwright.chromium.launch({ channel: "chromium", headless: true, args });
}

Test.test(
	"input controls recover capture and remote decoded media",
	async () => {
		const browser = await launch(FAKE_MEDIA);
		try {
			const publisher = await browser.newPage();
			const viewer = await browser.newPage();
			const errors: string[] = [];
			for (const page of [publisher, viewer]) page.on("pageerror", (error) => errors.push(error.message));
			const url = new URL("test/media.html", base);
			url.searchParams.set("relay", relayUrl);
			for (const kind of ["camera", "microphone"] as const) {
				const missing = await browser.newPage();
				url.searchParams.set("missing", kind);
				await missing.goto(url.href);
				await missing.waitForFunction(() => window.mediaTest);
				const input = missing.getByRole("switch", { name: `Toggle ${kind}`, exact: true });
				await input.click();
				// The capture's NotFoundError must not replace the unavailable state with Retry.
				await missing.waitForFunction((kind) => {
					const state = window.mediaTest.state();
					return state[`${kind}Devices`] === 0 && !!state[`${kind}Error`];
				}, kind);
				Test.expect(await input.getAttribute("data-state")).toBe("unavailable");
				Test.expect(await input.getAttribute("aria-busy")).toBe("false");
				Test.expect(await missing.getByRole("button", { name: `Retry ${kind}` }).count()).toBe(0);
				await missing.evaluate(() => window.mediaTest.close());
				await missing.close();
			}
			url.searchParams.delete("missing");
			await publisher.goto(url.href);
			url.searchParams.set("viewer", "");
			await viewer.goto(url.href);
			await Promise.all([publisher, viewer].map((page) => page.waitForFunction(() => window.mediaTest)));
			const control = (kind: Kind) => publisher.getByRole("switch", { name: `Toggle ${kind}`, exact: true });
			const live = async (kind: Kind) => {
				await publisher.waitForFunction((kind) => !!window.mediaTest.state()[kind], kind);
				Test.expect(await control(kind).getAttribute("data-state")).toBe("live");
			};
			const off = async (kind: Kind) => {
				await control(kind).click();
				await publisher.waitForFunction((kind) => !window.mediaTest.state()[kind], kind);
				Test.expect(await control(kind).getAttribute("aria-checked")).toBe("false");
			};
			const decoded = async (kind: Kind) => {
				// Media encoded before this check may be an earlier capture's, so require newer media.
				const since = await publisher.evaluate((kind) => window.mediaTest.state().encoded[kind], kind);
				const before = await viewer.evaluate(() => window.mediaTest.state());
				await viewer.waitForFunction(
					({ kind, since, before }) => {
						const state = window.mediaTest.state();
						return kind === "camera"
							? (state.video ?? 0) > since + 100 && (state.videoFrames ?? 0) > (before.videoFrames ?? 0)
							: (state.audio ?? 0) > since + 100 &&
									(state.audioBytes ?? 0) > (before.audioBytes ?? 0) &&
									state.rms > 0.001;
					},
					{ kind, since, before },
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
			for (const stage of ["support", "flush", "final flush"] as const) {
				// Hold native codec promises while retaining real encoding, transport, and decoding.
				console.info(`Recovering from a held native codec ${stage}`);
				if (stage === "final flush") {
					await control("camera").click();
					await live("camera");
					await decoded("camera");
					await publisher.evaluate(() => window.mediaTest.codec("flush"));
					await off("camera");
				} else {
					await publisher.evaluate((stage) => window.mediaTest.codec(stage), stage);
					await control("camera").click();
					await publisher.waitForFunction(() => window.mediaTest.state().held > 0);
					await off("camera");
				}
				await publisher.waitForFunction(() => window.mediaTest.state().held > 0);
				await publisher.evaluate(() => window.mediaTest.codec(undefined));
				await control("camera").click();
				await live("camera");
				await decoded("camera");
				Test.expect(await publisher.evaluate(() => window.mediaTest.state().held)).toBeGreaterThan(0);
				await publisher.evaluate(() => window.mediaTest.release());
				await off("camera");
			}
			for (const kind of ["camera", "microphone"] as const) {
				// New intent must win even when the old browser permission request never settles.
				await publisher.evaluate((kind) => window.mediaTest.mode(kind, "hold"), kind);
				await control(kind).click();
				await publisher.waitForFunction(() => window.mediaTest.state().held === 1);
				Test.expect(await control(kind).getAttribute("data-state")).toBe("pending");
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
				Test.expect(await control(kind).getAttribute("data-state")).toBe("failed");
				Test.expect(
					await retry.evaluate(
						(button) => document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent,
					),
				).toContain("Capture permission denied");
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
				if (kind === "microphone") {
					// Selecting the current device can also cancel a pending request from the menu.
					const selected = await publisher.evaluate(() => window.mediaTest.state().selectedMicrophone);
					if (!selected) throw new Error("Missing selected microphone");
					await off(kind);
					await publisher.evaluate(() => window.mediaTest.mode("microphone", "hold"));
					await control(kind).click();
					await publisher.waitForFunction(() => window.mediaTest.state().held === 1);
					await publisher.getByLabel("Microphone settings", { exact: true }).click();
					await publisher.getByRole("button", { name: selected, exact: true }).click();
					Test.expect(await control(kind).getAttribute("aria-checked")).toBe("false");
					await publisher.evaluate(() => window.mediaTest.release());
					await publisher.waitForFunction(() => window.mediaTest.state().liveTracks === 0);
					await control(kind).click();
					await live(kind);
					await decoded(kind);
				}
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
			Test.expect(final.videoError).toBeUndefined();
			Test.expect(final.audioError).toBeUndefined();
			await viewer.evaluate(() => window.mediaTest.close());
			Test.expect(errors).toEqual([]);
		} catch (error) {
			console.error(relayLog);
			throw error;
		} finally {
			await browser.close();
		}
	},
	90_000,
);

Test.test(
	"room tiles draw each peer through WebGL and again after a lost context",
	async () => {
		const browser = await launch([...FAKE_MEDIA, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);
		try {
			const errors: string[] = [];
			// SwiftShader fills the full-page canvas on the CPU every frame, which at the default
			// 1280x720 starves both pages' encoders and decoders on a small CI runner.
			const viewport = { width: 320, height: 240 };
			const alice = await browser.newPage({ viewport });
			const bob = await browser.newPage({ viewport });
			const pages = [alice, bob];
			for (const page of pages) {
				page.on("pageerror", (error) => errors.push(error.message));
				// Chromium reports GL errors as WebGL console messages, and the canvas logs a throwing frame.
				page.on("console", (message) => {
					if (/WebGL|render error/.test(message.text())) errors.push(message.text());
				});
			}
			const url = new URL("test/room.html", base);
			url.searchParams.set("relay", relayUrl);
			for (const [page, name] of [
				[alice, "alice"],
				[bob, "bob"],
			] as const) {
				url.searchParams.set("name", name);
				await page.goto(url.href);
			}
			// Each page shows exactly the other's tile, drawn from a frame its peer encoded after this
			// check began, so neither a replayed nor an already buffered frame passes.
			const drawn = async (page: Playwright.Page, peer: Playwright.Page, previous?: number) => {
				const since = await peer.evaluate(() => window.roomTest.state().encoded);
				await page.waitForFunction(
					({ previous, since }) => {
						const { remotes } = window.roomTest.state();
						return (
							remotes.length === 1 && remotes[0].textures !== previous && (remotes[0].drawn ?? -1) > since
						);
					},
					{ previous, since },
					{ timeout: 10_000 },
				);
			};
			await Promise.all([drawn(alice, bob), drawn(bob, alice)]);

			const before = await alice.evaluate(() => window.roomTest.state().remotes[0].textures);
			await alice.evaluate(() => window.roomTest.lose());
			await alice.waitForFunction(() => !window.roomTest.state().context);
			await alice.evaluate(() => window.roomTest.restore());
			// Restoration finishes in an async event, so sample bob's encoder only once it has, or a frame
			// encoded in between could seed the new textures and pass.
			await alice.waitForFunction(() => window.roomTest.state().context);
			await drawn(alice, bob, before);

			for (const page of pages) {
				Test.expect(await page.evaluate(() => window.roomTest.state().errors)).toEqual([]);
				await page.evaluate(() => window.roomTest.close());
			}
			Test.expect(errors).toEqual([]);
		} catch (error) {
			console.error(relayLog);
			throw error;
		} finally {
			await browser.close();
		}
	},
	30_000,
);

Test.test("a browser without WebGL2 gets the room page's fallback", async () => {
	const browser = await launch(["--disable-webgl"]);
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(new URL("@smoke", base).href);
		Test.expect(await page.evaluate(() => !document.createElement("canvas").getContext("webgl2"))).toBe(true);
		await page.getByRole("heading", { name: "WebGL2 is required" }).waitFor();
		Test.expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
});
