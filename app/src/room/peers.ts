import type { Signal } from "@moq/signals";
import type { Position } from "./metadata";

/** The window moves a local broadcast asks remote peers to make, keyed by each peer's handle. */
export type Moves = Record<string, Position> | undefined;

/** Ask the peer with `handle` to move its window, keeping the moves asked of other peers. */
export function request(moves: Signal<Moves>, handle: string, position: Position) {
	// Copy, since the caller may keep mutating its position while dragging.
	moves.update((prev) => ({ ...prev, [handle]: { ...position } }));
}

/** Stop asking the peer with `handle` to move once it publishes the position asked for. */
export function settle(moves: Signal<Moves>, handle: string, published: Position | undefined) {
	const asked = moves.peek()?.[handle];
	if (!asked || !published) return;

	// The stacking order is local, so only the placement and scale must match.
	if (asked.x !== published.x || asked.y !== published.y || asked.s !== published.s) return;
	drop(moves, handle);
}

/** Stop asking the peer with `handle` to move, such as when it leaves. */
export function drop(moves: Signal<Moves>, handle: string) {
	moves.update((prev) => {
		if (!prev || !(handle in prev)) return prev;
		const { [handle]: _, ...rest } = prev;
		return Object.keys(rest).length > 0 ? rest : undefined;
	});
}
