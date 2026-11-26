# [M] Make the Remote Control setting stop others from moving you

## Goal

Turning off Settings → "Remote Control" ("Allow others to drag/resize your
camera") stops peers from moving or resizing your tile, and peers see your tile
as locked. Your own ability to drag others does not depend on it.

## Plan

Today the setting is wired backwards: `Settings.draggable` sets your local
broadcasts' `location.peers.enabled`, which only `Space.#publishPosition`
reads, to decide whether *you* may publish moves for others.
The receiving side in `app/src/room/index.ts` applies every peer's
`peers.positions` entry for your handle unconditionally, and peers decide
`Broadcast.locked()` from whether your `location.window.handle` is set, which
`locationFields()` always fills.

- Apply incoming peer moves in `app/src/room/index.ts` only while
  `Settings.draggable` is on.
- Publish `location.window.handle` only while it is on, so peers'
  `locked()` shows your tile as locked; `handle` is already optional on the
  wire, so older peers keep working.
- Let `Space.#publishPosition` ask peers to move through any local broadcast,
  regardless of your own setting.
- Decided 2026-11-25 (maintainer, /quest-run): give each peer move a
  confirmation ID that the moved peer echoes back even when its position does
  not change, and drop a pending move only once its ID is confirmed. Today a
  move is settled only when the peer publishes the same x/y/s, so a move that
  undoes one still in flight, landing where the peer already is, stays queued
  and can replay later, snapping the tile back once. This changes the
  `hang/location.json` wire format, so it must work with older clients: add the
  ID and the echo as optional fields, and keep settling on matching x/y/s for
  peers that send no echo.
