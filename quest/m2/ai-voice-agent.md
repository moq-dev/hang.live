# [M] AI voice agent showcase

## Goal

A bursty AI voice participant in the room demonstrates MoQ's buffered
`lookahead` playback and instant barge-in `reset()`: its tile plays
faster-than-realtime audio smoothly at encoded pace without skipping ahead,
and flushes and re-anchors immediately when a person talks over it.

## Plan

Split from the captions quest on 2026-11-26 (maintainer, `/quest-run`), when
[#65](https://github.com/moq-dev/hang.live/pull/65) closed.

- Publish the agent as its own room broadcast from the summoning browser, like
  a screen share. Generate its speech faster than realtime with the in-browser
  engine [TTS on Phonon](/quest/m2/tts-phonon.md) adds, and publish each reply
  as a burst.
- Watch the agent's tile with `Watch.Player` `delay: 100ms`, `lookahead: 30s`
  (pinned `moq/` provides both, plus `reset()`). Other tiles keep the default
  live playback.
- Barge-in: when the summoner's microphone detects speech, stop the reply,
  mark an utterance boundary on the broadcast, and have every watcher call
  `reset()` on that boundary. Pinned `moq/` has no wire signal for the
  boundary, so propose one upstream in `moq-dev/moq` rather than inventing a
  Hang-only track; a Hang-specific JSON track is the fallback if upstream
  declines.
- The agent's broadcast is a Hang broadcast like any other, so moq.pro
  transcribes it and [live captions](/quest/m2/live-captions.md) show its
  speech with no work here.
- Keep heavy AI assets lazy-loaded and out of the initial room bundle.

## Waiting

- Maintainer: choose what generates the agent's replies. Options: (a)
  scripted replies spoken with local TTS, no service or key, enough to show
  `lookahead` and barge-in; (b) a small in-browser LLM, another large lazy
  download; (c) a hosted LLM API, which needs a paid account and a production
  secret only the maintainer can create. Recommendation: (a) now, with (c) as
  a later quest if the demo earns it. An agent cannot pick: it sets the demo's
  scope and any spend. Check: this item is replaced by a decision in the Plan.

## Required

- [TTS on Phonon](/quest/m2/tts-phonon.md) - the streaming in-browser speech engine the agent speaks with

## Related

- [Live captions](/quest/m2/live-captions.md) - captions the agent's speech like any participant's
