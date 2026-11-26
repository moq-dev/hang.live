# m1: Modernization and bugfixes

## Goal

Bring Hang's repository workflow, linting, tests, and relay configuration up to
`moq/` standards, retire self-hosted relay infrastructure in favor of `moq.pro`,
fix remaining WebGL/physics/UI/API bugs, and remove the Tauri native app.

## Plan

Decided 2026-11-25 (maintainer): adopt `moq/`'s agent and review workflow,
delete `infra/` for `moq.pro`, and delete the Tauri app; all three have landed.

Each child quest is independently shippable.
