# [M] Datagram live cursors, drag physics, and direct 1:1 P2P

## Goal

Dragging tiles and moving pointers feel instantaneous across peers via
unreliable WebTransport datagram tracks without head-of-line blocking, and 1:1
rooms can optionally connect directly browser-to-browser using `@moq/p2p`.

## Plan

Showcase MoQ's low-latency non-media transport features in Hang's spatial UI:

- **Datagram live cursors & drag streaming (`@moq/net` datagrams)**:
  - Publish ephemeral 60Hz cursor positions and live mid-drag tile coordinates
    over an unreliable datagram track (`broadcast.createDatagrams()` /
    `broadcast.datagrams()`) while keeping durable resting positions on the
    compressed `@moq/json` snapshot track for late joiners and WebSocket-only
    clients.
  - Render smooth remote cursor trails and live tile motion during drags
    (instead of waiting until `mouseup`), gracefully falling back to
    mouseup-only snapshots when datagrams are unavailable.
- **Direct 1:1 browser P2P (`@moq/p2p`)**:
  - Explore an opt-in 1:1 direct P2P room mode using `moq/js/p2p` (WebRTC
    `RTCDataChannel` + `@moq/qmux` carrying the exact same MoQ protocol with
    zero relay media egress), with lightweight signaling through the existing
    Cloudflare API or relay.
  - Upstream any missing signaling or `@moq/p2p` browser integration gaps to
    `moq-dev/moq` and verify clean fallback to `moq.pro` relay transport when
    peers cannot connect directly or a third participant joins.
