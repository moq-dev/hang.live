# [S] Make the Remote Control setting stop others from moving you

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
