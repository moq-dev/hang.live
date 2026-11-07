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
