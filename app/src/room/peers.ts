import type { Signal } from "@moq/signals";
import type { Position, Request } from "./metadata";

/** The window moves a local broadcast asks remote peers to make, keyed by each peer's handle. */
export type Moves = Record<string, Request> | undefined;

/** What a remote peer last published about its window. */
export type Peer = {
	handle: string;
	position: Position | undefined;
	/** The move IDs it echoes, or undefined for an older peer that echoes none. */
	applied: readonly string[] | undefined;
};

/** Ask `peer` to move `to`, keeping the moves asked of other peers. */
export function request(moves: Signal<Moves>, peer: Peer, to: Position) {
	// A peer that echoes nothing never publishes again for a move it already made, so nothing would settle
	// it. Skip it, unless it reverses a move still in flight.
	if (!peer.applied && !moves.peek()?.[peer.handle] && peer.position && placed(to, peer.position)) return;

	// Random, since a peer echoes the moves of every requester in one list.
	const id = Math.random().toString(36).substring(2, 15);
	// Copy, since the caller may keep mutating its position while dragging.
	moves.update((prev) => ({ ...prev, [peer.handle]: { ...to, id } }));
}

/** Stop asking `peer` to move once it confirms the move, or publishes its position if it can't confirm. */
export function settle(moves: Signal<Moves>, peer: Peer) {
	const asked = moves.peek()?.[peer.handle];
	if (!asked) return;

	// A matching position can't confirm an echoing peer: it may be where it was before a move still in flight.
	const done = peer.applied
		? asked.id !== undefined && peer.applied.includes(asked.id)
		: peer.position !== undefined && placed(asked, peer.position);
	if (done) drop(moves, peer.handle);
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

/** Applies the moves one remote peer asks of one local window, echoing the ID of the one it applied. */
export class Inbox {
	#window: { position: Signal<Position | undefined>; applied: Signal<string[] | undefined> };
	#echoed: string | undefined;

	constructor(window: { position: Signal<Position | undefined>; applied: Signal<string[] | undefined> }) {
		this.#window = window;
	}

	/** Apply the peer's current request unless it was already applied, or stop echoing once it's gone. */
	receive(request: Request | undefined) {
		// An older peer sends no ID, so its request is applied again each time it publishes, as it expects.
		if (request && (request.id === undefined || request.id !== this.#echoed)) {
			const { id: _, ...to } = request;
			this.#window.position.update((prev) => ({ ...prev, ...to }));
		}
		this.#echo(request?.id);
	}

	close() {
		this.#echo(undefined);
	}

	#echo(id: string | undefined) {
		const prev = this.#echoed;
		if (id === prev) return;
		this.#echoed = id;

		this.#window.applied.update((applied) => {
			const next = [...(applied ?? [])];
			const index = prev === undefined ? -1 : next.indexOf(prev);
			if (index >= 0) next.splice(index, 1);
			if (id !== undefined) next.push(id);
			return next;
		});
	}
}
