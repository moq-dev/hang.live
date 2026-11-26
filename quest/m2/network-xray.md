# [M] MoQ Network X-Ray HUD

## Goal

Users toggling Debug mode see a live, intuitive MoQ telemetry overlay showing
per-tile media health, audio jitter arrivals, PROBE round-trip latency, and
simulcast rendition switches responding in real time to spatial tile zoom and
bandwidth allocation.

## Plan

Upgrade `app/src/room/debug.ts` (which currently only renders static catalog
boxes) using the diagnostics already built into `moq/`:

- Enable `Publish.Broadcast` `stats: true` (and optional `echo` feedback) on
  local broadcasts so publish-side counters (frames, bytes, keyframes, skipped
  frames, target bitrate, PROBE RTT) are available alongside watch-side
  `video.out.stats` and `audio.out.stats`.
- Grade each tile continuously with the health grading in
  [`health.ts`](/moq/js/hang/src/health.ts) (`healthy`, `degraded`, `unhealthy`, `unknown`)
  and display its evidence on hover/expand. `@moq/hang` does not export it at
  the pinned `moq/`; export it upstream first.
- Plot real-time audio arrival jitter per tile with `@moq/ui`'s `graph` and
  `statCard`. Counter deltas can't show it; take each frame's arrival wall time
  minus its media timestamp from the audio decoder's `stats.arrival`
  ([`decoder.ts`](/moq/js/watch/src/audio/decoder.ts)) whenever it
  changes (a stall updates the counters without a new frame), and plot how far
  it trails the window's lowest offset.
- Highlight live HD ↔ SD simulcast transitions triggered by dragging/zooming a
  tile (`video.target` + `connection.viewers` downlink grants) so visitors can
  *see* MoQ's per-tile adaptive subscription working in real time.
- Keep zero overhead when the HUD is toggled off (no open stats subscriptions
  or graph timers while hidden).
