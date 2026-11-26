import type { Getter } from "@moq/signals";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/** A Solid accessor that tracks a signal until the current owner is disposed. */
export function solid<T>(signal: Getter<T>): Accessor<T> {
	// The signal already dedupes, so Solid must not drop equal-by-reference updates.
	const [get, set] = createSignal(signal.peek(), { equals: false });
	onCleanup(signal.subscribe((value) => set(() => value)));
	return get;
}
