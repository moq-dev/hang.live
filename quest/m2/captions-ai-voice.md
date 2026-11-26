# [L] Live captions and AI voice agent showcase

## Goal

Hang showcases synchronized multi-language live captions over native Hang text
tracks and demonstrates MoQ's buffered `lookahead` + instant barge-in `reset()`
playback with a bursty AI voice participant in the room.

## Plan

Build on the native text and buffered-playback capabilities in `moq/`:

- **Live captions (`Catalog.Text`)**:
  - Publish real-time caption cues on Hang's native `text` track (`format:
    "utf8"` or `"vtt"`, `role: "caption"`, stamped on the broadcast media clock)
    from local speech-to-text (or an external captioner) and consume them via
    `@moq/watch` so cues schedule in sync with audio/video.
  - Re-enable the caption toggle in `app/src/controls.tsx` and render crisp
    floating captions anchored to each participant tile, with language selection
    when multiple `text` renditions exist.
- **AI voice agent showcase (`lookahead` + barge-in `reset()`)**:
  - Support a room participant tile configured for faster-than-realtime bursty
    audio (using `Watch.Player`'s `lookahead`, e.g. `delay: 100ms`,
    `lookahead: 30s`) that plays smoothly at encoded pace without skipping
    ahead, and calls `reset()` to flush and re-anchor immediately on user
    barge-in.
  - Keep optional heavy AI assets lazy-loaded and out of the initial room bundle
    (and clean up the `onnxruntime-web` CDN workaround in `app/vite.config.ts`).
- Keep any reusable text-track rendering or voice-agent playback primitives
  upstream in `moq-dev/moq`.
