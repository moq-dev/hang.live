import { expect, test } from "bun:test";
import { Signal } from "@moq/signals";
import { Bounds, Vector } from "./geometry";
import { Gesture, type Local, type Remote, Stack, type Tile, type Touch } from "./gesture";
import type { Position } from "./metadata";
import type * as Peers from "./peers";
import { Deform } from "./physics";

// A 1000x1000 canvas, so a point maps to position (x / 1000 - 0.5, y / 1000 - 0.5).
const viewport = new Signal(Vector.create(1000, 1000));

type Room = {
	gesture: Gesture<Tile>;
	// The moves our camera asks of peers.
	moves: Signal<Peers.Moves>;
	camera: Tile & { source: Local };
};

// A tile covering a 200x200 square at `x, y`, placed at `position`.
function tile<S extends Tile["source"]>(source: S, x: number, y: number, position = place(0, 0)): Tile & { source: S } {
	return {
		bounds: new Signal(new Bounds(Vector.create(x, y), Vector.create(200, 200))),
		position: new Signal(position),
		dragPoint: new Signal(Vector.create(0.5, 0.5)),
		zoomCenter: new Signal(Vector.create(0.5, 0.5)),
		deform: new Deform(),
		visible: new Signal(true),
		source,
	};
}

const place = (x: number, y: number, s = 1): Required<Position> => ({ x, y, z: 1, s });

// A peer's tile at `x, y` that accepts moves at `handle` and echoes their IDs.
function remote(handle: string, x: number, y: number, position?: Required<Position>): Tile & { source: Remote } {
	const window = {
		position: new Signal<Position | undefined>(undefined),
		handle: new Signal<string | undefined>(handle),
		applied: new Signal<string[] | undefined>([]),
	};
	return tile({ role: "watch", location: { window }, located: new Signal(true) }, x, y, position);
}

// A room with our camera far off in the corner, plus `others`.
function room(...others: Tile[]): Room {
	const moves = new Signal<Peers.Moves>(undefined);
	const camera = tile(
		{
			role: "publish",
			location: {
				window: { position: new Signal<Position | undefined>(undefined) },
				peers: { positions: moves },
			},
		},
		5000,
		5000,
	);

	const tiles = [camera, ...others];
	const joined = new Map(tiles.map((tile, i) => [`${i}`, tile]));
	const gesture = new Gesture({ ordered: new Signal(tiles), joined, viewport, stack: new Stack() });
	return { gesture, moves, camera };
}

// The peer locks its tile, which ends its handle.
function lock(room: Room, tile: Tile & { source: Remote }): boolean {
	const handle = tile.source.location.window.handle.peek();
	if (!handle) throw new Error("already locked");
	tile.source.location.window.handle.set(undefined);
	return room.gesture.revoke(tile, handle);
}

const at = (x: number, y: number) => Vector.create(x, y);
const finger = (id: number, x: number, y: number): Touch => ({ id, point: at(x, y) });

test("a drag that turns into a pinch keeps the placement from before the drag", () => {
	const home = place(-0.4, -0.4);
	const peer = remote("a", 0, 0, home);
	const r = room(peer);

	r.gesture.touchStart([finger(1, 100, 100)]);
	r.gesture.touchMove([finger(1, 150, 150)]);
	expect(peer.position.peek()).toMatchObject({ x: -0.35, y: -0.35 });

	// A second finger lands on the same tile, turning the drag into a pinch.
	r.gesture.touchStart([finger(1, 150, 150), finger(2, 50, 50)]);
	expect(r.gesture.dragging).toBe(peer);
	expect(r.moves.peek()).toBeUndefined();

	// The peer rejects the gesture, so the tile goes back to where it sat before the drag, not the pinch.
	expect(lock(r, peer)).toBe(true);
	expect(peer.position.peek()).toEqual(home);
});

test("a lock mid-drag ends the gesture, so the fingers still down move nothing", () => {
	const peer = remote("a", 0, 0);
	const r = room(peer);

	r.gesture.touchStart([finger(1, 100, 100)]);
	lock(r, peer);
	expect(r.gesture.dragging).toBeUndefined();

	const before = peer.position.peek();
	r.gesture.touchMove([finger(1, 300, 300)]);
	expect(r.gesture.touchEnd([1], [])).toBeUndefined();
	expect(peer.position.peek()).toEqual(before);
	expect(r.moves.peek()).toBeUndefined();
});

test("a lock mid-pinch drops its baseline, so a later pinch on another tile can't scale from it", () => {
	const a = remote("a", 0, 0);
	const b = remote("b", 400, 0);
	const r = room(a, b);

	// Pinch tile a with the fingers 100 apart.
	r.gesture.touchStart([finger(1, 50, 100), finger(2, 150, 100)]);
	lock(r, a);
	r.gesture.touchEnd([1, 2], []);

	// Drag tile b, then land a second finger whose midpoint misses every tile, which starts no pinch.
	r.gesture.touchStart([finger(3, 500, 100)]);
	expect(r.gesture.dragging).toBe(b);
	r.gesture.touchStart([finger(3, 500, 100), finger(4, 500, 900)]);

	// Spreading those fingers 800 apart would scale b eightfold from tile a's baseline.
	r.gesture.touchMove([finger(3, 500, 100), finger(4, 500, 900)]);
	expect(b.position.peek().s).toBe(1);
});

test("a rejected move puts the tile back home, under whatever the peer published", () => {
	const home = place(-0.4, -0.4, 2);
	const peer = remote("a", 0, 0, home);
	const r = room(peer);

	r.gesture.down(at(100, 100));
	r.gesture.move(at(750, 750));
	r.gesture.up();
	expect(r.moves.peek()?.a).toMatchObject({ x: 0.25, y: 0.25 });

	// The peer moved itself before locking, so its placement wins where it published one.
	peer.source.location.window.position.set({ x: 0.3, y: -0.2 });
	expect(lock(r, peer)).toBe(false);
	expect(peer.position.peek()).toEqual({ ...home, x: 0.3, y: -0.2 });
	expect(r.moves.peek()).toBeUndefined();
});

test("a lock with no move pending leaves the tile alone", () => {
	const peer = remote("a", 0, 0);
	const r = room(peer);

	r.gesture.down(at(100, 100));
	r.gesture.move(at(600, 600));
	r.gesture.up();
	r.gesture.settle({ handle: "a", position: undefined, applied: [r.moves.peek()?.a?.id ?? ""] });
	expect(r.moves.peek()).toBeUndefined();

	const moved = peer.position.peek();
	lock(r, peer);
	expect(peer.position.peek()).toEqual(moved);
});

test("re-grabbing a tile with a move still pending keeps the older home", () => {
	const home = place(-0.4, -0.4);
	const peer = remote("a", 0, 0, home);
	const r = room(peer);

	r.gesture.down(at(100, 100));
	r.gesture.move(at(150, 150));
	r.gesture.up();

	// The peer hasn't applied the first move when we grab and zoom it again.
	r.gesture.down(at(150, 150));
	r.gesture.move(at(180, 180));
	r.gesture.up();
	r.gesture.wheel(at(180, 180), -100);

	lock(r, peer);
	expect(peer.position.peek()).toEqual(home);
});

test("lifting one pinch finger hands the drag to another tile under the other, publishing the first", () => {
	const a = remote("a", 0, 0);
	const b = remote("b", 400, 0);
	const r = room(a, b);

	r.gesture.touchStart([finger(1, 50, 100), finger(2, 150, 100)]);
	r.gesture.touchMove([finger(1, 450, 100), finger(2, 550, 100)]);
	expect(r.gesture.dragging).toBe(a);

	r.gesture.touchEnd([1], [finger(2, 550, 100)]);
	expect(r.gesture.dragging).toBe(b);
	expect(r.moves.peek()?.a).toMatchObject({ x: 0, y: -0.4 });
	expect(r.moves.peek()?.b).toBeUndefined();
});

test("our own tile publishes its placement directly instead of asking a peer", () => {
	const r = room();

	r.gesture.down(at(5100, 5100));
	r.gesture.move(at(500, 500));
	expect(r.camera.source.location.window.position.peek()).toBeUndefined();

	expect(r.gesture.up()).toBe(r.camera);
	expect(r.camera.source.location.window.position.peek()).toMatchObject({ x: 0, y: 0 });
	expect(r.moves.peek()).toBeUndefined();
});

test("a tile from outside Hang moves locally without asking anyone", () => {
	const obs = remote("a", 0, 0);
	obs.source.location.window.handle.set(undefined);
	obs.source.located = new Signal(false);
	const r = room(obs);

	expect(r.gesture.down(at(100, 100))).toBe(obs);
	expect(r.gesture.dragging).toBe(obs);
	r.gesture.move(at(750, 750));
	expect(r.gesture.up()).toBe(obs);

	expect(obs.position.peek()).toMatchObject({ x: 0.25, y: 0.25 });
	expect(r.moves.peek()).toBeUndefined();
});

test("a locked tile can't be grabbed or zoomed", () => {
	const peer = remote("a", 0, 0);
	const r = room(peer);
	lock(r, peer);

	expect(r.gesture.down(at(100, 100))).toBe(peer);
	expect(r.gesture.dragging).toBeUndefined();

	expect(r.gesture.wheel(at(100, 100), -100)).toBe(peer);
	expect(peer.position.peek().s).toBe(1);
	expect(r.moves.peek()).toBeUndefined();
});
