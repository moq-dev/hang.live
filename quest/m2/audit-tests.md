# [M] Audit test coverage

## Goal

Run the `tests` audit: `quest audit tests` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

Baseline from the m1 run (2026-11-25), measured with `bun test --coverage`
over each CI suite, nothing committed:

- `api` (`bun test --coverage test`): 41 tests. `account.ts` 92%,
  `auth.ts` 97%, `avatar.ts` 97%, `oauth.ts` 94%, `storage.ts` 96%,
  `room.ts` 84% (the join route itself, owned then by `room-token-identity`).
  The test harness builds its context and routes by hand, so `index.ts`,
  `context.ts`, `health.ts`, and CORS in `rpc.ts` load in no suite.
- `app` (the `test` script's flags plus `--coverage`): 57 tests. The pure
  modules (`capture`, `speaker`, `room/peers`, `room/physics`,
  `room/sanitize`, `room/preview`) sit at 100% and `room/metadata` at 98%.
  Nothing loads `room/space.ts`, the WebGL renderers, `room/watch.ts`,
  `room/video.ts`, `room/audio.ts`, `room/chat.ts`, or the page components
  besides `home` and `settings`; only `test/media.browser.ts` reaches capture
  and decode, in Chromium against a local relay.

Leave `moq/` alone: its suites are upstream's, and coverage reports list its
files only because the app imports them.

Check first: whether the Space gesture and room-page browser quests from the
m1 run landed and closed those gaps, then the fixes merged since 2026-11-25.

## Audit

- tests

## Required

- [m1](/quest/m1/README.md)

## Scheduled

- 2026-12-02
