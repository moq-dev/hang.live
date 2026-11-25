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

## Required

- [Adopt moq/ agent, lint, TypeScript, and CI guardrails](/quest/m1/repo-modernization.md) - `REVIEW.md`, Biome 2.6 with cycle/promise/`@moq/clock` rules, fixed API test runner, CI draft cancellation, and `@moq/room` token claims
- [Remove self-hosted relay infra in favor of moq.pro](/quest/m1/remove-infra.md) - delete `infra/` and wire production relay configuration and docs to `moq.pro`
- [Fix WebGL resource leaks, avatar fallbacks, and spatial physics](/quest/m1/webgl-physics.md) - shared static meshes, context-loss handling, working avatar fallbacks, NaN-safe math, and clock-driven `dt` physics
- [Fix SolidJS UI, account, and API reliability bugs](/quest/m1/ui-api-fixes.md) - meme volume clamp, SolidJS/blob leaks, accessible tooltips, working favorites/join/camera controls, and Drizzle/R2 account fixes
- [Stabilize Tauri native app as a mobile library canary](/quest/m1/native-canary.md) - single `.setup()` hook, fixed `hang://oauth` deep links, and non-disruptive update restarts
- [Add hang.live back to moq.dev demos](/quest/m1/moq-dev-demos.md) - re-list `hang.live` on `moq.dev` and MoQ docs once `m0` and `m1` are fixed up and deployed on `moq.pro`