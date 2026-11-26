# [M] Adopt moq/ agent, lint, TypeScript, and CI guardrails

## Goal

Hang shares `moq/`'s engineering guardrails so automated reviews, lints,
deterministic clock tests, and CI checks catch bugs before merge.

## Plan

Port the relevant repository practices from the pinned `moq/` submodule:

- **Agent & review docs**: add a base-branch `REVIEW.md` modeled on
  `moq/REVIEW.md` (approach-before-lines, concrete evidence, and a Hang-specific
  "Not findings" list). Add concise nested `AGENTS.md` files (or a compact repo
  map) for `app/` and `api/` documenting boundary rules and test commands.
- **Biome & deterministic time** (`biome.jsonc`, `package.json`): upgrade Biome
  to match `moq/` (`2.6.x`), enable `suspicious.noImportCycles` (ignoring types)
  and remove unused `madge`, enable `nursery.noFloatingPromises` and
  `nursery.noMisusedPromises`, enable `style.useImportType`, and add a
  `noRestrictedGlobals` override banning raw `performance`, `Date`,
  `setTimeout`, and `setInterval` in `app/src/room/**` so room logic uses
  `@moq/clock` and is testable with `Clock.Manual`.
- **TypeScript & test runner hygiene** (`tsconfig.json`, `api/package.json`,
  `app/tsconfig.json`): align compiler strictness with `moq/js/tsconfig.json`
  (`useUnknownInCatchVariables`, `allowUnreachableCode: false`,
  `allowUnusedLabels: false`, and evaluate TypeScript 7 alignment). Change
  `api/package.json`'s `test` script from hardcoded `bun test test/room.test.ts`
  to run all tests under `api/test/`.
- **CI & justfile parity** (`.github/workflows/check.yml`, `justfile`): trigger
  PR cancellation on `converted_to_draft` and `closed` (matching
  `moq/.github/workflows/check.yml`), and keep `just check` / `just ci` /
  `just gate` clearly aligned with `CONTRIBUTING.md`.
- **Auth claims parity** (`api/src/room.ts`): delegate room claim construction
  to `@moq/room`'s `claims()`, attach a relay stats `label` and sensible rate
  caps (`publish_rate`/`subscribe_rate`), and evaluate `connection.auth` in-band
  token renewal when adopting `moq-lite-07-wip`.

Fix all newly flagged lint/promise/clock violations in the same PR or split into
clean follow-up commits so `just check` stays green.
