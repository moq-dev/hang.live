# [M] AI voice agent showcase

## Goal

A bursty AI voice participant in the room demonstrates MoQ's buffered
`lookahead` playback and instant barge-in `reset()`: its tile plays
faster-than-realtime audio smoothly at encoded pace without skipping ahead,
and flushes and re-anchors immediately when a person talks over it.

## Plan

Split from the captions quest on 2026-11-26 (maintainer, `/quest-run`), when
[#65](https://github.com/moq-dev/hang.live/pull/65) closed.

- Decided 2026-11-26 (maintainer, `/quest-run`): ✅ scripted replies spoken
  with local Phonon TTS now, a hosted LLM later if the demo earns it
  (rejected: hosted LLM now; leave it open). Scripted replies need no service
  or key and are enough to show `lookahead` and barge-in.
- First, upstream in `moq-dev/moq`: add an agent kind to `@moq/room`'s path
  convention (`moq/js/room/src/path.ts`), such as `{identity}/agent.hang`
  under the summoner's existing publish grant. Today `parse()` accepts only
  `camera` and `screen`, and Hang's discovery loop (`app/src/room/index.ts`)
  skips any other path, so other participants would never see the agent's
  tile; reusing `screen` would collide with a live screen share. Bump the
  `moq/` pin once it lands.
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

## Required

- [TTS on Phonon](/quest/m2/tts-phonon.md) - the streaming in-browser speech engine the agent speaks with

## Related

- [Live captions](/quest/m2/live-captions.md) - captions the agent's speech like any participant's
