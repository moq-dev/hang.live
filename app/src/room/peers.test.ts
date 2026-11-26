import { expect, test } from "bun:test";
import { Signal } from "@moq/signals";
import type { Position } from "./metadata";
import * as Peers from "./peers";

const at = (x: number, y: number) => ({ x, y, z: 3, s: 1 });

// A peer that echoes move IDs, publishing `applied`.
const echoing = (handle: string, applied: string[] = [], position?: Position): Peers.Peer => ({
	handle,
	position,
	applied,
});

// An older peer that echoes nothing.
const legacy = (handle: string, position?: Position): Peers.Peer => ({ handle, position, applied: undefined });

const idOf = (moves: Signal<Peers.Moves>, handle: string) => {
	const id = moves.peek()?.[handle]?.id;
	if (id === undefined) throw new Error(`no move asked of ${handle}`);
	return id;
};

test("moving one peer keeps the moves asked of others", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	Peers.request(moves, echoing("a"), at(0.1, 0.1));
	Peers.request(moves, echoing("b"), at(0.2, 0.2));
	expect(moves.peek()).toMatchObject({ a: at(0.1, 0.1), b: at(0.2, 0.2) });
	expect(idOf(moves, "a")).not.toBe(idOf(moves, "b"));
});

test("an echoing peer settles a move only by its ID, even one that leaves it in place", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	const home = at(0.1, 0.1);

	// Away and straight back: the peer is already home, but may still apply the move away.
	Peers.request(moves, echoing("a", [], home), at(0.3, 0.3));
	const away = idOf(moves, "a");
	Peers.request(moves, echoing("a", [], home), home);
	const back = idOf(moves, "a");

	// Sitting where asked confirms nothing.
	Peers.settle(moves, echoing("a", [], home));
	// Nor does echoing the superseded move.
	Peers.settle(moves, echoing("a", [away], at(0.3, 0.3)));
	expect(moves.peek()).toMatchObject({ a: home });

	Peers.settle(moves, echoing("a", ["other", back], home));
	expect(moves.peek()).toBeUndefined();
});

test("an echoing peer is asked even to stay where it is", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	const home = at(0.1, 0.1);
	Peers.request(moves, echoing("a", [], home), home);
	Peers.settle(moves, echoing("a", [idOf(moves, "a")], home));
	expect(moves.peek()).toBeUndefined();
});

test("an older peer settles once it publishes the position, ignoring stacking order", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	Peers.request(moves, legacy("a"), at(0.1, 0.1));
	Peers.request(moves, legacy("b"), at(0.2, 0.2));

	// Not there yet.
	Peers.settle(moves, legacy("a", at(0.3, 0.3)));
	Peers.settle(moves, legacy("a"));
	expect(moves.peek()).toMatchObject({ a: at(0.1, 0.1), b: at(0.2, 0.2) });

	Peers.settle(moves, legacy("a", { ...at(0.1, 0.1), z: 9 }));
	expect(Object.keys(moves.peek() ?? {})).toEqual(["b"]);

	// The last settled move clears the field rather than publishing an empty record.
	Peers.drop(moves, "b");
	expect(moves.peek()).toBeUndefined();
});

test("a later drag of the same peer replaces its earlier move", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	const position = at(0.1, 0.1);
	Peers.request(moves, legacy("a"), position);

	// The caller keeps mutating its position while dragging; the request must not follow it.
	position.x = 0.4;
	expect(moves.peek()?.a.x).toBe(0.1);

	Peers.request(moves, legacy("a"), position);
	// The peer adopting the stale first move doesn't drop the newer one.
	Peers.settle(moves, legacy("a", at(0.1, 0.1)));
	expect(moves.peek()?.a.x).toBe(0.4);
});

test("an older peer is not asked to make a move it already made, unless it reverses one in flight", () => {
	const moves = new Signal<Peers.Moves>(undefined);
	const home = at(0.1, 0.1);

	// It never publishes again for a move it already made, so nothing would settle it.
	Peers.request(moves, legacy("a", home), home);
	expect(moves.peek()).toBeUndefined();

	// Moving away and straight back must still reach a peer that may apply the first move.
	Peers.request(moves, legacy("a", home), at(0.3, 0.3));
	Peers.request(moves, legacy("a", home), home);
	expect(moves.peek()).toMatchObject({ a: home });
});

test("the inbox applies each move once and echoes it until the request goes away", () => {
	const window = {
		position: new Signal<Position | undefined>({ x: 0, y: 0, z: 7, s: 1 }),
		applied: new Signal<string[] | undefined>(["another-peer"]),
	};
	const inbox = new Peers.Inbox(window);

	inbox.receive({ x: 0.5, y: 0.5, id: "m1" });
	expect(window.position.peek()).toEqual({ x: 0.5, y: 0.5, z: 7, s: 1 });
	expect(window.applied.peek()).toEqual(["another-peer", "m1"]);

	// The requester republishing for another peer must not replay a move we since overrode.
	window.position.set({ x: 0.9, y: 0.9, z: 7, s: 1 });
	inbox.receive({ x: 0.5, y: 0.5, id: "m1" });
	expect(window.position.peek()).toEqual({ x: 0.9, y: 0.9, z: 7, s: 1 });

	// A newer move replaces the echo.
	inbox.receive({ x: 0.2, y: 0.2, id: "m2" });
	expect(window.position.peek()).toMatchObject({ x: 0.2, y: 0.2 });
	expect(window.applied.peek()).toEqual(["another-peer", "m2"]);

	inbox.receive(undefined);
	expect(window.applied.peek()).toEqual(["another-peer"]);

	inbox.receive({ x: 0.3, y: 0.3, id: "m3" });
	inbox.close();
	inbox.close();
	expect(window.applied.peek()).toEqual(["another-peer"]);
});

test("the inbox applies an older peer's request each time it arrives, echoing nothing", () => {
	const window = {
		position: new Signal<Position | undefined>(undefined),
		applied: new Signal<string[] | undefined>(undefined),
	};
	const inbox = new Peers.Inbox(window);

	inbox.receive({ x: 0.5, y: 0.5 });
	window.position.set({ x: 0.9, y: 0.9 });
	inbox.receive({ x: 0.5, y: 0.5 });
	expect(window.position.peek()).toEqual({ x: 0.5, y: 0.5 });
	expect(window.applied.peek()).toBeUndefined();
});
