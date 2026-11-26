# [M] Deduplicate room and controls helpers

## Goal

Each room and controls behavior that is written more than once lives in one helper, and placeholder fields that exist only to satisfy a type union are gone, with no visible change to the room.

## Plan

Found by the m1 `code` audit (2026-11-25); line numbers are from that run.

- Canvas-to-page positioning, written four times in `app/src/room/chat.ts`, `debug.ts`, `name.ts`, and `locator.ts`, and the scroll-and-resize follow effect in three of them: add `Canvas.page(bounds)` beside `Canvas.relative` and one follow helper. `Name`, `Chat`, and `Debug` then take `broadcast.canvas` instead of a separate `canvas` argument.
- `app/src/room/space.ts` input handlers: merge the touch end and cancel bodies with the mouse release, and give the hover swap, the z-index bump (`prev.z === max ? max : ++max`, four copies), and the point-within-bounds check (four copies, as a `Bounds` method) one helper each.
- Fade opacity, written in `broadcast.ts` and twice in `video.ts`: one `fade(active, since, now)` helper.
- The five deformation uniforms set alike by `gl/border.ts`, `gl/audio.ts`, and `gl/broadcast.ts`: one helper. `gl/shader.ts`'s `Attribute` only wraps a number, so return the number.
- `app/src/room/index.ts`: loop the copy-pasted camera/screen and locator effects, and make `space.add` generic instead of casting its result.
- `BroadcastSource` placeholders: `debug.ts`'s publish branch never runs, because `HangLocalSource`'s `catalog` signals are always unset. Narrow it to watched broadcasts, then delete the unset `catalog`, `target`, `active`, and `source` fields from `HangLocalSource`, `FakeBroadcast`, and `WatchBroadcast`. `local.ts` passes a `Signal` through a `Getter` prop and casts it back to set it; pass a computed of `screen.out.source` instead.
- `app/src/room/preview/` only renames `@moq/room`'s `Room` (`prefix` to `path`, `remotes` to `members`); use `@moq/room` from `app/src/preview.tsx` and delete the directory.
- The click-outside handler, written in `app/src/controls.tsx` four times and in `components/meme-selector.tsx`: one `onClickOutside(refs, close)` helper. Replace the meme selector's 100 ms "prevent immediate close" timer by stopping the opening click's propagation.
- `controls.tsx`'s `Visualize` repeats the RMS meter in `room/audio.ts`; read `broadcast.audio.volume`.
- `app/src/settings.tsx` repeats `effect.subscribe(... localStorage ...)` 17 times: one `persisted(key, parse)` helper, and `loadGain` reuses `Speaker.validVolume`.
- `room/audio.ts` and `PannedSound` ramp the pan differently (`PannedSound` doubles it); pick one curve when merging them.
