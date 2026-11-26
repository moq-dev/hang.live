The SolidJS frontend (`@hang/live`), built with Vite and served from Cloudflare Workers.

- `src/room/` is the spatial room: `@moq/room` publishing and watching, WebGL rendering under `gl/`, physics, chat, and TTS. Its logic reads time through `@moq/clock` (Biome enforces it), so tests drive it with `Manual` from `@moq/clock/test`.
- Reactive room state uses `@moq/signals`; read `moq/js/AGENTS.md` before touching it. SolidJS components bridge signals through `src/util/solid.ts`.
- Reach the API through `src/api.ts`; it imports only types from `@hang/api` and runtime helpers from `@hang/api/client`.
- `bun run --cwd app test` runs unit tests under happy-dom; `bun run --cwd app test:media` drives Chromium with fake devices against a local relay to check capture, encoding, and decoding end to end.
