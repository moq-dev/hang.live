Repository-specific review rules for Hang (extends Quest's shared review rules, read from the base branch).

# Checks

- **Approach first**: judge whether the change belongs here and takes the simplest route before reading its lines. Generic media, protocol, auth, and room logic belongs upstream in `moq-dev/moq`; flag a local copy of what a `@moq/*` package provides, or a workaround for its bug, and recommend the upstream fix.
- **Boundaries**: the app reaches the API through `@hang/api` types and the browser-safe `@hang/api/client`; it never imports Worker internals, and Worker code never imports browser modules.
- **Mixed versions**: `just deploy` ships the API before the app, and open tabs keep the old app. A request or response shape, stored setting, or D1 migration must work with the previous app build.
- **Grants**: a relay token lets a participant publish only under its own identity and subscribe only within its room. Flag any grant that widens either.

# Tests

Flag unit tests that wait on the real clock; room logic reads time through `@moq/clock`, so install `Manual` from `@moq/clock/test`. Only `app/test/media.browser.ts`, which drives a real browser, codecs, and relay, may use real time; flag a wait there that media from an earlier capture or stage could satisfy.

# Not findings

- Missing tests for SolidJS markup, CSS, or WebGL shaders, which are checked on the running app.
- Behavior a `@moq/*` package owns; report it upstream instead.
- A shim for an API shape no deployed app build uses.
