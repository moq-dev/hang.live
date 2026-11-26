# [M] Deduplicate remote watch pipelines and fix room audio

## Goal

Each remote participant runs a single MoQ watch pipeline wired into shared
downlink bandwidth allocation, spatial panning and mute/unmute work reliably for
mono and stereo voices, peer metadata is validated, and browser support warnings
are visible.

## Plan

Address the MoQ integration and Web Audio defects identified in the 2026-11-25
audit:

- **Single watch pipeline + shared downlink bandwidth**
  (`app/src/room/index.ts`, `app/src/room/watch.ts`): `MoqRoom` (`@moq/room`)
  already instantiates a `Watch.Player` (with `connection.viewers` and user/
  preview metadata) inside every remote `Member`, while `Room.#addRemote`
  ignores it and opens a second `WatchBroadcast` for the exact same path without
  `connection.viewers`. Reuse `Member`'s `Watch.Player` / decoders (leaving
  `member.canvas` unset for Hang's WebGL2 renderer and attaching Hang's extra
  tracks to `member.broadcast`), or otherwise eliminate the duplicate
  subscription while ensuring `connection.viewers` coordinates ABR and PROBE
  estimates across all tiles.
- **Room audio graph & mute correctness** (`app/src/room/audio.ts`,
  `app/src/room/sound.ts`):
  - Apply `StereoPannerNode` for mono streams (`channelCount >= 1`), not only
    `channelCount > 1`, so default mono microphone audio pans spatially.
  - Fix `exponentialRampToValueAtTime` throwing `RangeError` when unmuting from
    `0` (clamp/anchor starting gain above `GAIN_MIN` or use linear/setTarget
    ramps) in both `Audio` and `Sound.#runGain`.
  - Initialize new remote `GainNode`s to `0` when audio is muted instead of
    `Settings.audio.volume`.
  - Route `Sound.notification()` through `this.gain` instead of connecting
    directly to `this.context.destination` so mute and speaker volume apply.
  - Cancel or drop in-flight `Audio.#runMemeAudio` playback if its effect cleans
    up before `fetch`/`decodeAudioData` finishes.
- **Metadata safety & chat track upgrade** (`app/src/room/metadata.ts`):
  validate remote `hang/location.json` and `hang/chat.json` payloads with Zod
  schemas using `consumer.latest()` (mirroring `moq/js/room/src/metadata.ts`),
  call `track.finish()` before `track.close()` on cleanup, and migrate room chat
  from lossy `Json.Snapshot` to `@moq/room`'s `Chat` (`Json.Window`) so rapid
  and repeated messages are not dropped.
- **Browser support & media errors** (`app/src/sup.tsx`, `app/src/index.tsx`):
  show `<moq-watch-support show="warning" />` and `<moq-publish-support
  show="warning" />` instead of `prop:show="never"`, and surface decoder
  `out.error` states cleanly (coordinating capture errors with
  [media-toggles](/quest/m0/media-toggles.md)).

Keep reusable room/player improvements upstream in `moq-dev/moq` if Hang exposes
a gap in `@moq/room`.
