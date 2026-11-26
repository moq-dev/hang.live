# [M] Datagram live cursors and drag physics

## Goal

Dragging tiles and moving pointers feel instantaneous across peers via
unreliable WebTransport datagram tracks without head-of-line blocking, while
late joiners and clients without datagrams still see resting positions.

## Plan

Showcase MoQ's low-latency non-media transport in Hang's spatial UI with
`@moq/net` datagram tracks (`broadcast.createDatagrams()` /
`broadcast.datagrams()`):

- Publish ephemeral 60Hz cursor positions and live mid-drag tile coordinates
  over an unreliable datagram track, while keeping durable resting positions on
  the compressed `@moq/json` snapshot track for late joiners and WebSocket-only
  clients.
- Render smooth remote cursor trails and live tile motion during drags
  (instead of waiting until `mouseup`). Decide the path at connect from the
  session's transport: WebSocket sessions, which carry no datagrams, use
  mouseup-only snapshots.
- Direct browser-to-browser P2P is out of scope: `moq-dev/moq` removed
  `@moq/p2p` in [moq-dev/moq#8771](https://github.com/moq-dev/moq/pull/8771),
  and the maintainer is investigating alternatives.
