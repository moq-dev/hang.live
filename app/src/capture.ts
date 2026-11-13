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
