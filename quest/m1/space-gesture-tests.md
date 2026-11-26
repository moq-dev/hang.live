# [M] Test the room's drag, pinch, and lock gestures

## Goal

The gesture handling in `app/src/room/space.ts` (mouse drag, wheel zoom,
touch drag, pinch, the drag-to-pinch hand-off, and a peer's lock ending a
gesture and restoring the tile) runs under unit tests in `bun test`, with no
WebGL, audio, or relay.

## Plan

Space mixes DOM events, WebGL rendering, and peer moves in one 869-line class,
so no suite loads it; #51's touch and lock fixes are covered only by `tsc` and
Biome. Extract the gesture state machine into a pure module the way
`room/peers.ts` and `room/physics.ts` were: it takes pointer events in canvas
coordinates plus each tile's bounds and `locked` state, and returns what to
apply (the dragged tile, its new position, the position to publish, the tile to
restore). Space keeps the event wiring and applies the results.

Cover at least: a drag turning into a pinch keeps the pre-gesture placement;
a lock mid-drag or mid-pinch ends the gesture so a later touch cannot resume
its baseline; a rejected move restores the remembered home under the peer's
published placement; re-grabbing a tile with a move still pending keeps the
older home.

Rejected: driving Space itself in happy-dom, since constructing a `Broadcast`
pulls in `AudioContext`, the chat worker, and the video pipeline; exercising
gestures only in a real browser, which is slower. The room-page smoke in
`app/test/media.browser.ts` covers rendering only, so gestures still need
this quest's tests.
