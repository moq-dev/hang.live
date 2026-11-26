# [M] Smoke-join hang.live in a real browser after each deploy

## Goal

After every production deploy, and on a schedule between deploys, two headless
Chromium pages join one room on `https://hang.live` with fake cameras and each
sees the other; the run fails loudly, naming the step that broke, when the
live site, API, or relay stops letting people hang out.

## Plan

`app/test/media.browser.ts` already launches Chromium with fake capture devices
and SwiftShader WebGL against a local relay; this reuses those launch flags
against production instead of Vite and `moq-relay`. It stays out of PR CI and
`just check`.

- Drive only the shipped page, since production exposes no test state: page A
  opens `/@<room>`, clicks "Join as Guest", and turns its camera on; page B,
  still on the join screen, must list page A in the room preview, then join
  too. Read results from the DOM and roles, not pixels; tile drawing stays
  covered by the local smoke, which can read the renderer's state.
- Fail on any page error and on WebGL errors, the same filter the local smoke
  uses.
- Run as the last step of the deploy job from
  [#59](https://github.com/moq-dev/hang.live/pull/59)'s deploy-on-merge quest,
  printing the rollback command on failure, and hourly on a self-hosted runner
  so a relay or API outage between deploys surfaces too. A scheduled failure
  files or updates one tracking issue instead of opening a new one each run.
- Guest joins mint only a `guest/<uuid>` path (`api/src/room.ts`), so runs
  leave no accounts behind; recheck this if room tokens change guest joins.
- Use a fixed room name reserved for the smoke so real rooms never see it.

