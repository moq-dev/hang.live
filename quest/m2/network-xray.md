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
- Grade each tile continuously with `Hang.Health` (`healthy`, `degraded`,
  `unhealthy`, `unknown`) and display its evidence on hover/expand.
- Plot real-time audio frame arrival times and gaps per tile using
  `player.audio.arrivals()` and `@moq/ui`'s sparkline/stats primitives
  (matching `moq/demo/web/src/stats.ts`).
- Highlight live HD ↔ SD simulcast transitions triggered by dragging/zooming a
  tile (`video.target` + `connection.viewers` downlink grants) so visitors can
  *see* MoQ's per-tile adaptive subscription working in real time.
- Keep zero overhead when the HUD is toggled off (no open `arrivals()` handles
  or graph timers while hidden).
