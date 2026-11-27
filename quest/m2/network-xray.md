# [S] MoQ Network X-Ray: health grades, publisher counters, and audio jitter

## Goal

Debug mode's MoQ telemetry HUD grades each tile's health with `Hang.Health`
(`healthy`, `degraded`, `unhealthy`, `unknown`) and shows its evidence on
hover or expand, shows the local tiles' publish-side counters (frames, bytes,
keyframes, skipped frames, target bitrate), shows each remote tile's
downlink grant beside its pixel target, and graphs each remote tile's audio
jitter.

## Plan

`app/src/room/debug.ts` already shows, only while Debug is on: each remote
tile's renditions with the active one ringed, its pixel target, an amber flash
on every HD ↔ SD switch, sparklines of video bitrate and frame rate with the
decoders' late, stall, underrun, and skip counters, and a room-wide panel of
PROBE round trip, downlink estimate, and PROBE target.

The rest needs APIs the pinned `moq/` lacks (see Waiting). Once they land,
bump the pin and:

- Grade each remote tile with `Health.viewer` from its player's own feedback
  snapshot and each local tile with `Health.publisher`, every
  `Report.INTERVAL`, as a pill beside the renditions; list the evidence when
  the pill is hovered.
- Add a publish panel to local tiles from their renditions' stats.
- Show the grant beside the remote tile's target, so a downgrade reads as
  either the tile shrinking or the downlink running out.
- Add an audio jitter sparkline from the decoder's own ingress jitter
  estimate. Deriving it in Hang from the decoder's newest-arrival stats
  misses groups that arrive too late to be read, so the trace stays flat
  through the dropouts it should explain;
  [#64](https://github.com/moq-dev/hang.live/pull/64) dropped that version.
- Keep the zero-overhead rule: nothing subscribed or timed while Debug is off.

## Waiting

- moq-dev/moq: export `Health` from `@moq/hang` (it lives in
  `js/hang/src/health.ts` but neither `index.ts` nor the package `exports`
  name it), and give `Watch.Player` a public view of its own feedback
  snapshot or a graded `health` output, since `Decoder.feedback()` is
  `@internal`. Check: `grep -n -i health moq/js/hang/src/index.ts` at the pin.
- moq-dev/moq: let `@moq/room` `Local` expose each published rendition's
  stats (or `Publish.Broadcast` list its renditions), and pass through
  `stats`/`echoPath`. Check: `moq/js/room/src/local.ts` passes `stats` to its
  `Publish.Broadcast`s.
- moq-dev/moq: expose `Watch.Player`'s downlink grant (the `holdViewer`
  result in `js/watch/src/player.ts`). Check: `grep -n grant
  moq/js/watch/src/player.ts` shows a public output.
- moq-dev/moq: expose the audio decoder's measured jitter (the private
  `#measured` in `js/watch/src/audio/decoder.ts`, fed from the container
  consumer's `spread`). Check: `grep -n measured
  moq/js/watch/src/audio/decoder.ts` shows a public output.
