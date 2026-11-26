# [S] Dependency advisory alerts

## Goal

A security advisory in a Hang dependency surfaces within days as a PR or failing signal, not at the next milestone's deps audit.

## Plan

The first deps audit found `hono` (the API Worker) six patch releases behind with middleware-bypass advisories and `drizzle-orm` behind a SQL-injection fix; nothing flagged them in between.
`moq/` covers the same gap with `.github/dependabot.yml` (weekly grouped updates, a 7-day cooldown that security updates bypass) plus a landing workflow and a nightly `just js audit`.

Recommended: add `.github/dependabot.yml` for the `bun` (root) and `github-actions` ecosystems, weekly, grouped, `cooldown.default-days: 7`, ignoring `playwright` (pinned to the Nix shell's driver) and leaving the `moq/` submodule and flake inputs out, since they move together by hand.
Land its PRs through `/quest-run` like any other until Hang adopts moq's bot landing.

## Waiting

- Maintainer: choose how advisories surface between audits, since it changes recurring PR traffic: (a) Dependabot version and security updates as above (recommended: it opens the fix, not just an alert); (b) a nightly `bun audit --prod` workflow on `main`, which fails loudly but needs triage and today reports upstream-only findings (moq's `typedoc`, `kokoro-js`'s `sharp`); (c) rely on the per-milestone deps audit
