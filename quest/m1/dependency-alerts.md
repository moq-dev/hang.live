# [S] Dependency advisory alerts

## Goal

A security advisory in a Hang dependency surfaces within days, not at the next milestone's deps audit: as a fix PR when a patched release exists, otherwise as an alert the maintainer is notified of.

## Plan

The first deps audit found `hono` (the API Worker) six patch releases behind with middleware-bypass advisories and `drizzle-orm` behind a SQL-injection fix; nothing flagged them in between.
`moq/` covers the same gap with `.github/dependabot.yml` (weekly grouped updates, a 7-day cooldown that security updates bypass) plus a landing workflow and a nightly `just js audit`.

Decided 2026-11-26 (maintainer, /quest-run): ✅ (a) Dependabot version and security updates, plus alerts (rejected: (b) a nightly `bun audit --prod` workflow on `main`, (c) rely on the per-milestone deps audit).
Add `.github/dependabot.yml` for the `bun` (root) and `github-actions` ecosystems, weekly, grouped, `cooldown.default-days: 7`, ignoring `playwright` (pinned to the Nix shell's driver) and leaving the `moq/` submodule and flake inputs out, since they move together by hand.
Dependabot alerts and security updates are both disabled on this repository today (moq has both on), and `dependabot.yml` enables neither, so turn them on too, through dotfiles' `repo-settings` so every repository gets the same standard rather than a one-off toggle.
An advisory with no patched release gets an alert but no PR; the next deps audit decides whether to replace the package or accept it.
Land its PRs through `/quest-run` like any other until Hang adopts moq's bot landing.
