# [S] Prune the Tauri icon generator and unreferenced public assets

## Goal

The app ships only assets something references, and the dev-only icon page carries no generator for platforms Hang no longer builds.

## Plan

Found by the m1 `code` audit (2026-11-25). Each item is checked against code, HTML, CSS, and dynamic paths (avatars 1-50, logo frames `hang/`, `live/`, `offline/`).

- `app/src/icons.tsx` (647 lines), served only in development at `/dev/icons`, generates macOS, iOS, Android, and Windows Store icons for the deleted Tauri app; `jszip` exists only for its bulk download. Its `iconDataUrl`/`renderIconToPng` path never runs.
- Unreferenced files under `app/public/`: `image/we-are/1-7.svg`, `avatar/kixel.png`, `image/background.svg`, `image/icon-default.svg`, `meme/linus.png`, `meme/speedrun.{mp4,webm,png}` (only a commented-out entry in `room/meme.ts`), `notification/{bye,sup}.opus` (commented out in `room/sound.ts`), `meme/webm.txt` (an ffmpeg note served publicly), and `image/hang/h.svg` (embedded inline by `icons.tsx`).
- `app/public/_redirects` maps `/@*` to the app, which `not_found_handling: "single-page-application"` in `app/wrangler.jsonc` already does; check a room deep link on a preview deploy before dropping it.

Users lose nothing in the app: no page links these files. Anyone hot-linking one gets a 404.

Decided 2026-11-26 (maintainer, /quest-run): ✅ (a) delete the `/dev/icons` generator: `icons.tsx`, its route, and `jszip`, since the generated icons are checked in (rejected: (b) keep only the favicon and Discord banner variants, (c) keep it as is).

Decided 2026-11-26 (maintainer, /quest-run): ✅ (a) delete every unreferenced `app/public` file listed above (rejected: (b) delete only the commented-out memes and notification sounds, (c) keep them).
