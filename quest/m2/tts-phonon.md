# [M] TTS on Phonon

## Goal

High-quality room text-to-speech runs on Phonon instead of the stale `kokoro-js`, without its dependency stack, and speaks chat messages at least as well as today.
Low stays the browser's `speechSynthesis`, with no download.

## Plan

Decided 2026-11-26 (maintainer, `/quest-run`): ✅ Phonon 31M through the `phonon-tts` npm package for the High setting, keeping `speechSynthesis` as Low, and dropping `kokoro-js`, transformers.js 3, and `sharp` (rejected: vendoring the Kokoro wrapper onto transformers.js 4; benchmarking both engines before choosing).
Why: `phonon-tts` (MIT OR Apache-2.0) ships a model of about 55 to 65 MB that runs on the CPU as WebAssembly in a worker by default and streams 24 kHz audio, so High no longer needs WebGPU or ONNX Runtime.
Risks: it is pre-1.0 (0.7.1 when decided) and speaks English only, like the one Kokoro voice Hang uses today.

`kokoro-js` 1.2.1 (May 2025, its last release) pins `@huggingface/transformers` ^3.5.1, which drags in an `onnxruntime-web` dev build and Node-only `sharp` 0.34 with open libvips advisories that `bun audit --prod` reports.
Hang uses only `KokoroTTS.from_pretrained` and `generate` with one voice (`app/src/room/tts/kokoro.ts`).

- Replace `app/src/room/tts/kokoro.ts` and its worker with `phonon-tts`, keeping the progress signal the settings panel shows while the model downloads.
- Play the stream as it arrives rather than waiting for a whole message.
- Drop the WebGPU gate on High in `app/src/settings.tsx` if Phonon's CPU path keeps up; keep it only if it does not.
- Once ORT is gone, remove anything left for it in `app/vite.config.ts` and confirm `dist/` no longer emits the ORT `.wasm` asset.
- Measure against Kokoro on the same machine and record both in the PR: time from a chat message to its first audio, and the bytes the High setting downloads (worker bundle plus model).
- Update the privacy page (`app/src/privacy.tsx`) if the model is fetched from a different host than Kokoro's (huggingface.co today).

Verify on the real surface: load a room, pick High, and confirm a chat message is spoken.

## Related

- [AI voice agent](/quest/m2/ai-voice-agent.md) - speaks with this engine
