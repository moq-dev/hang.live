# m1: Modernization and bugfixes

## Goal

Bring Hang's repository workflow, linting, tests, and relay configuration up to
`moq/` standards, retire self-hosted relay infrastructure in favor of `moq.pro`,
fix remaining WebGL/physics/UI/API bugs, and remove the Tauri native app.

## Plan

Decided 2026-11-25 (maintainer):
- Adopt `moq/`'s AI/review workflow (`REVIEW.md`, stricter Biome, `@moq/clock`,
  TypeScript/CI hygiene).
- Delete `infra/` and point production relay config to `moq.pro`.

Decided 2026-11-25 (maintainer, /quest-run): delete Tauri: `native/`, its app
glue, the download page, native release recipes, updater manifests, and its
dependencies. This supersedes the earlier "keep `native/` as a canary" decision;
Hang is web-only.

Each child quest is independently shippable.
