import * as Signals from "@moq/signals";

// A failed capture refunds its retry budget only after processing enabled=false.
// Wait for its cleared error as that acknowledgement before enabling it again.
interface Props {
	enabled: Signals.Signal<boolean>;
	error: Signals.Getter<Error | undefined>;
	settings: readonly Signals.Getter<unknown>[];
}

export class Retry {
	#attempt: Signals.Effect | undefined;
	#closed = false;
	#props: Props;

	constructor(props: Props) {
		this.#props = props;
	}

	start(): void {
		this.#attempt?.close();
		const { enabled, error, settings } = this.#props;
		if (this.#closed || !enabled.peek() || !error.peek()) return;

		const attempt = new Signals.Effect();
		this.#attempt = attempt;
		const requested = settings.map((setting) => setting.peek());
		for (const setting of settings) attempt.cleanup(setting.subscribe(() => attempt.close()));
		attempt.cleanup(enabled.subscribe((value) => value && attempt.close()));
		attempt.cleanup(
			error.subscribe((value) => {
				if (value || attempt.abort.aborted) return;
				const current =
					!enabled.peek() && settings.every((setting, index) => setting.peek() === requested[index]);
				attempt.close();
				if (current) enabled.set(true);
			}),
		);
		enabled.set(false);
	}

	close(): void {
		this.#closed = true;
		this.#attempt?.close();
	}
}

interface SelectProps {
	enabled: Signals.Signal<boolean>;
	// The saved choice, which reaches the capture's requested device a few microtasks later.
	setting: Signals.Signal<string | undefined>;
	requested: Signals.Getter<string | undefined>;
}

// Saves a device and turns capture on only once the capture requests that device,
// so turning on with a new choice never opens the previous or default device first.
export class Select {
	#pending: Signals.Effect | undefined;
	#props: SelectProps;

	constructor(props: SelectProps) {
		this.#props = props;
	}

	start(deviceId: string): void {
		this.#pending?.close();
		const { enabled, setting, requested } = this.#props;
		setting.set(deviceId);
		if (requested.peek() === deviceId) {
			enabled.set(true);
			return;
		}

		const pending = new Signals.Effect();
		this.#pending = pending;
		// Toggling capture or picking again in the meantime supersedes this choice.
		pending.cleanup(enabled.subscribe(() => pending.close()));
		pending.cleanup(setting.subscribe((value) => value !== deviceId && pending.close()));
		pending.cleanup(
			requested.subscribe((value) => {
				if (value !== deviceId || pending.abort.aborted) return;
				pending.close();
				enabled.set(true);
			}),
		);
	}

	close(): void {
		this.#pending?.close();
	}
}
