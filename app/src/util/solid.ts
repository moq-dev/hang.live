import type { Getter } from "@moq/signals";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/** A Solid accessor that tracks a signal until the current owner is disposed. */
export function solid<T>(signal: Getter<T>): Accessor<T> {
	// The signal already dedupes, so Solid must not drop equal-by-reference updates.
	const [get, set] = createSignal(signal.peek(), { equals: false });
	onCleanup(signal.subscribe((value) => set(() => value)));
	return get;
}

/** Call `close` on any click outside every element `inside` lists, until the current owner is disposed. */
export function onClickOutside(inside: () => readonly (Node | undefined)[], close: () => void) {
	// Capture, so this sees the clicked element before a handler re-renders it away, and a click that
	// opens a menu has already passed by the time the menu adds this listener.
	const click = (e: MouseEvent) => {
		const target = e.target as Node;
		if (!inside().some((element) => element?.contains(target))) close();
	};
	document.addEventListener("click", click, true);
	onCleanup(() => document.removeEventListener("click", click, true));
}
