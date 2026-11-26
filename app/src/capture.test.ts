import * as Test from "bun:test";
import * as Signals from "@moq/signals";
import * as Capture from "./capture";

// Drain signal notifications without wall-clock sleeps or production deadlines.
async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

function fixture() {
	const enabled = new Signals.Signal(true);
	const error = new Signals.Signal<Error | undefined>(new Error("Permission denied"));
	const device = new Signals.Signal("first");
	const constraints = new Signals.Signal({ width: 640 });
	const retry = new Capture.Retry({ enabled, error, settings: [device, constraints] });
	return { enabled, error, device, constraints, retry };
}

Test.test("retry waits for the capture to process disabled before enabling", async () => {
	const capture = fixture();
	try {
		capture.retry.start();
		await flush();
		Test.expect(capture.enabled.peek()).toBe(false);
		capture.error.set(undefined);
		await flush();
		Test.expect(capture.enabled.peek()).toBe(true);
	} finally {
		capture.retry.close();
	}
});

Test.test("closed and superseded retries never re-enable a late acknowledgement", async () => {
	for (const supersede of ["close", "enable", "device", "constraints"] as const) {
		const capture = fixture();
		try {
			capture.retry.start();
			await flush();
			if (supersede === "close") capture.retry.close();
			if (supersede === "enable") capture.enabled.set(true);
			if (supersede === "device") capture.device.set("second");
			if (supersede === "constraints") capture.constraints.set({ width: 1280 });
			await flush();
			capture.enabled.set(false);
			capture.error.set(undefined);
			await flush();
			Test.expect(capture.enabled.peek()).toBe(false);
		} finally {
			capture.retry.close();
		}
	}
});

Test.test("a stale retry click cannot restart a recovered or disabled capture", async () => {
	const capture = fixture();
	try {
		capture.error.set(undefined);
		capture.retry.start();
		Test.expect(capture.enabled.peek()).toBe(true);
		capture.enabled.set(false);
		capture.error.set(new Error("Old refusal"));
		capture.retry.start();
		capture.error.set(undefined);
		await flush();
		Test.expect(capture.enabled.peek()).toBe(false);
		capture.retry.close();
		capture.enabled.set(true);
		capture.error.set(new Error("Old refusal"));
		capture.retry.start();
		Test.expect(capture.enabled.peek()).toBe(true);
	} finally {
		capture.retry.close();
	}
});

// Mirrors the app's chain: the saved setting reaches the requested device two effect hops later.
function selectFixture() {
	const enabled = new Signals.Signal(false);
	const setting = new Signals.Signal<string | undefined>("old");
	const preferred = new Signals.Signal<string | undefined>(undefined);
	const requested = new Signals.Signal<string | undefined>(undefined);
	const opened: (string | undefined)[] = [];
	const signals = new Signals.Effect();
	signals.run((effect) => preferred.set(effect.get(setting)));
	signals.run((effect) => requested.set(effect.get(preferred)));
	// Stands in for the capture, which opens whatever is requested once enabled.
	signals.run((effect) => {
		if (effect.get(enabled)) opened.push(effect.get(requested));
	});
	const select = new Capture.Select({ enabled, setting, requested });
	const close = () => {
		select.close();
		signals.close();
	};
	return { enabled, setting, requested, opened, select, close };
}

Test.test("selecting a device while off opens only that device", async () => {
	const capture = selectFixture();
	try {
		await flush();
		Test.expect(capture.requested.peek()).toBe("old");
		capture.select.start("new");
		Test.expect(capture.enabled.peek()).toBe(false);
		await flush();
		Test.expect(capture.enabled.peek()).toBe(true);
		Test.expect(capture.opened).toEqual(["new"]);
	} finally {
		capture.close();
	}
});

Test.test("selecting the already requested device enables at once", async () => {
	const capture = selectFixture();
	try {
		await flush();
		capture.select.start("old");
		Test.expect(capture.enabled.peek()).toBe(true);
		await flush();
		Test.expect(capture.opened).toEqual(["old"]);
	} finally {
		capture.close();
	}
});

Test.test("a later pick or toggle supersedes a pending selection", async () => {
	for (const supersede of ["pick", "toggle", "setting", "close"] as const) {
		const capture = selectFixture();
		try {
			await flush();
			capture.select.start("new");
			if (supersede === "pick") capture.select.start("other");
			if (supersede === "toggle") {
				capture.enabled.set(true);
				await flush();
				capture.enabled.set(false);
			}
			if (supersede === "setting") capture.setting.set(undefined);
			if (supersede === "close") capture.select.close();
			await flush();
			Test.expect(capture.enabled.peek()).toBe(supersede === "pick");
			if (supersede !== "toggle") Test.expect(capture.opened).toEqual(supersede === "pick" ? ["other"] : []);
		} finally {
			capture.close();
		}
	}
});
