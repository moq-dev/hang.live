import type { Signal } from "@moq/signals";
import type { Position } from "./metadata";

/** The window moves a local broadcast asks remote peers to make, keyed by each peer's handle. */
export type Moves = Record<string, Position> | undefined;

/** A move to ask of a peer: where it should go, and where it last published itself. */
export type Move = { to: Position; from: Position | undefined };

/**
 * Ask the peer with `handle` to make `move`, keeping the moves asked of other peers.
 *
 * A peer already there never publishes again to settle the request, so it's skipped, unless it reverses a
 * move still in flight.
 */
export function request(moves: Signal<Moves>, handle: string, move: Move) {
	if (!moves.peek()?.[handle] && move.from && placed(move.to, move.from)) return;

	// Copy, since the caller may keep mutating its position while dragging.
	moves.update((prev) => ({ ...prev, [handle]: { ...move.to } }));
}

/** Stop asking the peer with `handle` to move once it publishes the position asked for. */
export function settle(moves: Signal<Moves>, handle: string, published: Position | undefined) {
	const asked = moves.peek()?.[handle];
	if (!asked || !published || !placed(asked, published)) return;
	drop(moves, handle);
}

// The stacking order is local, so only the placement and scale must match.
function placed(a: Position, b: Position): boolean {
	return a.x === b.x && a.y === b.y && a.s === b.s;
}

/** Stop asking the peer with `handle` to move, such as when it leaves. */
export function drop(moves: Signal<Moves>, handle: string) {
	moves.update((prev) => {
		if (!prev || !(handle in prev)) return prev;
		const { [handle]: _, ...rest } = prev;
		return Object.keys(rest).length > 0 ? rest : undefined;
	});
}
