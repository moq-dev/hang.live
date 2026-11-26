# [M] TTS off kokoro-js

## Goal

Room text-to-speech runs Kokoro on the same transformers.js release the rest of the app would use, without `kokoro-js`'s stale dependency stack, and speaks as it does today.

## Plan

`kokoro-js` 1.2.1 (May 2025, the last release; the upstream `hexgrad/kokoro` repository last touched it in August 2025) pins `@huggingface/transformers` ^3.5.1.
It drags in transformers.js 3.8.1, an `onnxruntime-web` dev build, and Node-only `sharp` 0.34 with open libvips advisories that `bun audit --prod` reports.
Hang uses only `KokoroTTS.from_pretrained` and `generate` with a voice and speed (`app/src/room/tts/kokoro.ts`).

Recommended: vendor the small Kokoro wrapper (phonemizer call, voice embeddings, model invocation) into `app/src/room/tts/` on transformers.js 4, checking that transformers.js 4 still exports `StyleTextToSpeech2Model`, then drop `kokoro-js`.
If upstream publishes a `kokoro-js` release on transformers.js 4 first, take that instead.

Verify on the real surface: load a room, enable TTS, and confirm a chat message is spoken with the chosen voice on WebGPU.
Compare the TTS worker bundle size before and after.

## Related

- [Live captions and AI voice](/quest/m2/captions-ai-voice.md) - also touches the heavy AI assets and the `onnxruntime-web` external in `app/vite.config.ts`
