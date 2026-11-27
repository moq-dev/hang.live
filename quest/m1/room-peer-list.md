# [S] List the room's peers for screen readers

## Goal

The room page carries a visually hidden list of who is in the room, by name, so a screen-reader user knows who is there.
The production smoke reads it on both pages to check each lists the other by name, instead of the app badge's count.

## Plan

- The maintainer kept this follow-up when picking [#77](https://github.com/moq-dev/hang.live/pull/77) to merge on 2026-11-27: ✅ keep (rejected: drop).
- The room draws peers only on its canvas, so nothing in the DOM lists them.
  Add a screen-reader-only list, labelled for the room, of each tile in `room.space.ordered` by its user's name (`app/src/sup.tsx`'s `App`).
- Switch the last step of `app/test/smoke.ts` from the badge count to each page listing the other by name, in the same PR.
  The required quest points the hourly smoke at `release` and runs the smoke each deploy ships, so no production build older than the list meets the new check.

## Required

- [Deploy staging on merge and production on release](/quest/m1/deploy-staging-and-release.md) - runs the hourly smoke from `release`, so changing it with the page never fails against an older production build
