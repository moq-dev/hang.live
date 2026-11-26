import { expect, test } from "bun:test";
import { Signal } from "@moq/signals";
import * as Peers from "./peers";

const at = (x: number, y: number) => ({ x, y, z: 3, s: 1 });

test("moving one peer keeps the moves asked of others", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	Peers.request(moves, "a", { to: at(0.1, 0.1), from: undefined });
	Peers.request(moves, "b", { to: at(0.2, 0.2), from: undefined });
	expect(moves.peek()).toEqual({ a: at(0.1, 0.1), b: at(0.2, 0.2) });
});

test("a move is dropped once the peer publishes it, ignoring stacking order", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	Peers.request(moves, "a", { to: at(0.1, 0.1), from: undefined });
	Peers.request(moves, "b", { to: at(0.2, 0.2), from: undefined });

	// Not there yet.
	Peers.settle(moves, "a", at(0.3, 0.3));
	Peers.settle(moves, "a", undefined);
	expect(moves.peek()).toEqual({ a: at(0.1, 0.1), b: at(0.2, 0.2) });

	Peers.settle(moves, "a", { ...at(0.1, 0.1), z: 9 });
	expect(moves.peek()).toEqual({ b: at(0.2, 0.2) });

	// The last settled move clears the field rather than publishing an empty record.
	Peers.drop(moves, "b");
	expect(moves.peek()).toBeUndefined();
});

test("a later drag of the same peer replaces its earlier move", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	const position = at(0.1, 0.1);
	Peers.request(moves, "a", { to: position, from: undefined });

	// The caller keeps mutating its position while dragging; the request must not follow it.
	position.x = 0.4;
	expect(moves.peek()?.a.x).toBe(0.1);

	Peers.request(moves, "a", { to: position, from: undefined });
	// The peer adopting the stale first move doesn't drop the newer one.
	Peers.settle(moves, "a", at(0.1, 0.1));
	expect(moves.peek()?.a.x).toBe(0.4);
});

test("a move the peer already made is skipped, unless it reverses one in flight", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	const home = at(0.1, 0.1);

	// The peer never publishes again for a move it already made, so nothing would settle it.
	Peers.request(moves, "a", { to: home, from: home });
	expect(moves.peek()).toBeUndefined();

	// Moving away and straight back must still reach a peer that may apply the first move.
	Peers.request(moves, "a", { to: at(0.3, 0.3), from: home });
	Peers.request(moves, "a", { to: home, from: home });
	expect(moves.peek()).toEqual({ a: home });
});
