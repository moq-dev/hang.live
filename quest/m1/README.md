# m1: Modernization and bugfixes

## Goal

Bring Hang's repository workflow, linting, tests, and relay configuration up to
`moq/` standards, retire self-hosted relay infrastructure in favor of `moq.pro`,
fix remaining WebGL/physics/UI/API bugs, and stabilize the Tauri native canary.

## Plan

Decided 2026-11-25 (maintainer):
- Adopt `moq/`'s AI/review workflow (`REVIEW.md`, stricter Biome, `@moq/clock`,
  TypeScript/CI hygiene).
- Delete `infra/` and point production relay config to `moq.pro`.
- Keep `native/` as a minimal canary for testing MoQ's Android/iOS libraries,
  fixing its glaring defects without expanding consumer native scope.

Each child quest is independently shippable.
