# [M] Live captions from moq.pro transcripts

## Goal

A viewer who turns on captions sees each remote participant's speech as
captions on that participant's tile, trailing their audio by no more than
the transcriber's measured lag. The text comes
from the transcript rendition moq.pro publishes for each Hang broadcast, not
from anything running in the speaker's browser. Captions are off by default
for every viewer, and encrypted rooms have none.

## Plan

Decided 2026-11-26 (maintainer, `/quest-run`):

- ✅ Close [#65](https://github.com/moq-dev/hang.live/pull/65) (in-browser
  Whisper captions) and carry its UI into this quest (rejected: land
  in-browser captions as an interim; strip #65 to its watch side only). Why:
  speech-to-text comes from moq.pro transcription (upstream `moq-transcribe`),
  so #65's publisher would be deleted soon after landing.
- ✅ Source-language captions first, translation once the upstream translator
  runs on moq.pro; one transcription rule for every Hang room, with captions
  off by default per viewer; no captions in encrypted rooms (rejected: a
  per-room opt-in; holding captions until translation lands).

Upstream `moq-transcribe` (pinned `moq/quest/m3/transcribe/`) consumes a
`.hang` broadcast and publishes a derivative broadcast whose catalog lists the
source's renditions plus a `transcript` text rendition (`role: "caption"`,
one group per utterance, interim then final revisions). moq.pro runs it as a
hosted service for broadcasts a project rule matches, transcribing only while
someone subscribes to the transcript rendition, so the CC toggle is what
starts and stops the work.

- Watch each remote tile's transcript: subscribe to the derivative catalog's
  transcript rendition while captions are on, and render it with `@moq/watch`'s
  `Text.Renderer` into a DOM overlay that follows the tile. Turning captions
  off drops the subscription.
- Reuse #65's watch-side pieces (head
  [`7d1f56f`](https://github.com/moq-dev/hang.live/tree/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a)):
  - the CC toggle in
    [`controls.tsx`](https://github.com/moq-dev/hang.live/blob/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a/app/src/controls.tsx),
    backed by a new storage key that defaults to off and is written only
    when the viewer turns captions on. Delete `Settings.captions.render`:
    it defaults to on and is already stored as `true` for past visitors, so
    reusing it would subscribe them, and start transcription, without a
    click;
  - `pick()` and the per-tile overlay in
    [`captions/overlay.ts`](https://github.com/moq-dev/hang.live/blob/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a/app/src/room/captions/overlay.ts)
    with its
    [test](https://github.com/moq-dev/hang.live/blob/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a/app/src/room/captions/overlay.test.ts),
    and the "Show captions in" picker in
    [`settings.tsx`](https://github.com/moq-dev/hang.live/blob/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a/app/src/settings.tsx),
    which falls back to any track, so it works with one source-language
    rendition and picks a translation once those appear;
  - the text wiring in
    [`watch.ts`](https://github.com/moq-dev/hang.live/blob/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a/app/src/room/watch.ts)
    and [`broadcast.ts`](https://github.com/moq-dev/hang.live/blob/7d1f56fab788b52ab6d2b7ca41aa029d659eec1a/app/src/room/broadcast.ts),
    including keeping a tile's audio decoding while its captions show, since
    captions play on its clock, with the tile's gain keeping it silent when
    room audio is off.
- Drop #65's publish half (worklet, segmenter, Whisper worker, model download,
  WebGPU-only gate) and delete the unused `Settings.captions.capture` key.
- Hide the CC toggle in encrypted rooms ([E2EE rooms](/quest/m2/e2ee-rooms.md)):
  a transcriber cannot read ciphertext.
- Name moq.pro, and the speech-to-text backend it uses at launch (Deepgram
  Nova-3, per pinned `moq/quest/m3/transcribe/README.md`), as transcription
  processors on the privacy page (`app/src/privacy.tsx`): a participant's
  audio is sent to them while anyone in the room shows captions.
- Captions trail the audio by the transcriber's lag, since Hang plays at low
  latency and `@moq/watch` shows a late revision on arrival. Keep room
  latency as is, and measure that lag (from when a phrase plays to when its
  caption shows) on the real surface, recording it in the PR.
- Add an automated signal that a transcript frame arrives: a check against the
  production relay that publishes speech into a room, turns captions on, and
  fails when no transcript frame arrives in time, reporting the lag above.
  Run it after deploy or on a schedule, not as a PR gate, since it depends on
  moq.pro.
- The [AI voice agent](/quest/m2/ai-voice-agent.md) publishes a broadcast too,
  so its speech gets captions the same way, with no work there.

## Waiting

- moq-dev/moq: land the `transcript` text format and its `@moq/watch`
  rendering ([format](https://github.com/moq-dev/moq/blob/main/quest/m3/transcribe/format.md)),
  then `moq-transcribe` ([crate](https://github.com/moq-dev/moq/blob/main/quest/m3/transcribe/crate.md)),
  and a `moq/` pin that includes both. Check: both quest files are gone from
  upstream `main` and Hang's `moq/` gitlink is at or past the merge.
- moq.pro: run hosted transcription with a rule matching Hang's broadcasts.
  The maintainer advances it. Check: subscribing to a Hang broadcast's
  derivative catalog on the production relay lists a transcript rendition.
- Maintainer: decide how a Hang session reaches transcripts. Room tokens are
  rooted at `RELAY_PREFIX/<room>` (`api/src/room.ts`), but a transcript and its
  derivative catalog may be announced outside that root. (If upstream names
  the derivative beneath its source, as `moq-transcode` does with
  `<source>/transcode.hang`, today's tokens already cover it and this item
  clears.) Options: (a) re-root room tokens at `RELAY_PREFIX`, with subscribe
  `<room>` plus wherever moq.pro announces that room's transcripts, and
  publish `<room>/<identity>`; version the join contract so a tab already
  in a call keeps receiving grants under the old room root at renewal (a
  changed `grant.path` reloads it, `app/src/sup.tsx`), and only updated
  clients opt into the new root;
  (b) have moq.pro announce transcripts beneath the room root, so today's
  tokens cover them unchanged; (c) a second subscribe-only connection for
  transcripts. Recommendation: (a), since one connection and one token can
  grant several prefixes, so Hang does not depend on where moq.pro names the
  derivative, and it changes only `api/src/room.ts` and the paths the app
  joins. An agent cannot take this: the maintainer said nothing is decided
  yet. Check: this item is replaced by a decision in the Plan.

## Related

- [E2EE rooms](/quest/m2/e2ee-rooms.md) - encrypted rooms show no captions
- [AI voice agent](/quest/m2/ai-voice-agent.md) - its broadcast is transcribed like any other
