# [M] AI voice agent showcase

## Goal

A bursty AI voice participant in the room demonstrates MoQ's buffered
`lookahead` playback and instant barge-in `reset()`: its tile plays
faster-than-realtime audio smoothly at encoded pace without skipping ahead, and
flushes and re-anchors immediately when a person talks over it.

Live captions over native `text` tracks shipped separately; the agent's speech
should get captions the same way (a `captions/<lang>` `utf8` track on its
broadcast), since it already has the text it speaks.

## Plan

- Publish the agent as its own room broadcast from the summoning browser, like
  a screen share. Generate its speech with the lazy-loaded Kokoro worker in
  `app/src/room/tts/` faster than realtime, and publish each reply as a burst.
- Watch the agent's tile with `Watch.Player` `delay: 100ms`,
  `lookahead: 30s` (pinned `moq/` provides both, plus `reset()`). Other tiles
  keep the default live playback.
- Barge-in: when the summoner's microphone detects speech, stop the reply,
  mark an utterance boundary on the broadcast, and have every watcher call
  `reset()` on that boundary. Pinned `moq/` has no wire signal for the boundary,
  so propose one upstream in `moq-dev/moq` rather than inventing a Hang-only
  track; a Hang-specific JSON track is the fallback if upstream declines.
- Keep heavy AI assets lazy-loaded and out of the initial room bundle.
- `kokoro-js` pins `@huggingface/transformers` 3.x while captions use 4.x, so
  the two workers each bundle their own ONNX runtime. Moving Kokoro to 4.x (or
  dropping `kokoro-js` for a direct 4.x pipeline) removes one copy.

## Waiting

- Maintainer: choose what generates the agent's replies. Options: (a) scripted
  replies with local Kokoro speech, no service or key, enough to show
  `lookahead` and barge-in; (b) a small in-browser LLM (transformers.js),
  another large lazy download; (c) a hosted LLM API, which needs a paid account
  and a production secret only you can create. Recommendation: (a) now, with
  (c) as a later quest if the demo earns it.
