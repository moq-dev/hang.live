# [M] Fix SolidJS UI, account, and API reliability bugs

## Goal

Every interactive control, account flow, and API endpoint behaves cleanly
without crashes, memory leaks, accessibility traps, or broken R2/D1 state.

## Plan

Fix the verified frontend and API bugs surfaced in the 2026-11-25 audit:

- **Meme selector** (`app/src/components/meme-selector.tsx`): remove the
  broken `createSignal(() => localStorage.setItem(...))` duplicate persistence;
  clear the 100ms outside-click listener timer on unmount.
- **Account page & API account/favorites fixes** (`app/src/account.tsx`,
  `api/src/account.ts`, `api/src/fave.ts`):
  - Track and revoke the actual object URLs created for uploaded avatar previews
    instead of `URL.revokeObjectURL(URL.createObjectURL(a))`, and align client
    name validation (`minLength(4)`) with the API.
  - Fix `account.create()` storing `Avatar.random()` (`/avatar/N.svg`) with
    `avatarType: "r2"`, which produces broken `${R2_PUBLIC_URL}/avatar//avatar/...`
    URLs.
  - In `account.update()`, validate and upload the new R2 avatar *before*
    deleting the old object, and update `updatedAt`. Ensure `account.delete()`
    cleans up associated `favorites` rows.
  - Migrate `api/src/fave.ts` from raw SQL + `error.message.includes("UNIQUE")`
    to a Drizzle schema table and `onConflictDoNothing()`.
- **SolidJS leaks, controls & accessibility**:
  - `app/src/components/create.tsx`: move `clearInterval` into `onCleanup`
    (SolidJS `onMount` ignores returned functions).
  - `app/src/components/tooltip.tsx`: remove the nested
    `<div role="button" tabIndex={0}>` wrapper that breaks keyboard focus and
    screen readers across every button/link in the app.
  - `app/src/home.tsx`: wire the `showMore` signal to actually slice favorites
    to 6 when collapsed.
  - `app/src/sup.tsx`: add `disabled={!status("connected")}` to the Preview Join
    button, handle join errors gracefully in the UI, and abort stale join
    requests when `props.room` or auth state changes.
  - `app/src/controls.tsx`: allow opening the Camera device picker before
    enabling capture, close the menu cleanly on disable (matching Microphone),
    and clear device-change toast timers on unmount/re-trigger.
  - `app/src/settings.tsx` & `app/src/api.ts`: validate `microphone.gain`
    against `NaN`/range on load, fix `document.addEventListener("unload", ...)`
    (`window`/`pagehide`), and make `logout()` clear only auth/account keys
    instead of wiping all `localStorage` preferences.
  - `app/src/layout/app.tsx`, `app/src/about.tsx`, `app/src/download.tsx`:
    deduplicate `RoomNav`/`RoomNavMobile`, handle clipboard failures, update the
    stale `github.com/kixelated/moq` link and typo in `About`, stop mutating
    removed fake peer `three`, and fix primary button highlighting on Windows in
    `Download`.

Add focused unit tests for settings validation, account/favorites API flows, and
fixed SolidJS components.
