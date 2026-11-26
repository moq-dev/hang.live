# m2: MoQ showcase features

## Goal

Turn Hang into a compelling live showcase of what Media over QUIC makes easy
that WebRTC/HLS struggle with: real-time transport/media telemetry, end-to-end
encryption, external OBS/CLI/studio interoperability, synchronized captions and
barge-in AI voice, and datagram-driven spatial interactivity / direct P2P.

## Plan

Decided 2026-11-25 (maintainer): include these five showcase features in the
roadmap after `m0` and `m1` establish a clean, modern baseline. Reusable media,
crypto, room, and protocol pieces belong upstream in `moq-dev/moq` and are
consumed here through the pinned `moq/` submodule.

Each child quest is independently shippable.

## Required

- [MoQ Network X-Ray HUD](/quest/m2/network-xray.md) - per-tile `Hang.Health`, live audio jitter arrival charts, PROBE RTT, and simulcast HD/SD switching on tile zoom
- [End-to-end encrypted private rooms](/quest/m2/e2ee-rooms.md) - private rooms via `@moq/crypto` with the key kept in the URL `#fragment`
- [Bring your own publisher and egress](/quest/m2/byo-publisher.md) - one-click scoped publish token for OBS / `moq-studio` / `moq import` plus `moq export` commands
- [Live captions and AI voice agent showcase](/quest/m2/captions-ai-voice.md) - synchronized `Catalog.Text` captions and bursty AI voice playback using `lookahead` + barge-in `reset()`
- [Datagram live cursors, drag physics, and direct 1:1 P2P](/quest/m2/datagrams-p2p.md) - 60Hz unreliable datagram cursor/drag streams and optional direct 1:1 `@moq/p2p` transport