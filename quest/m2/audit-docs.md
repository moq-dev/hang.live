# [M] Audit the docs

## Goal

Run the `docs` audit: `quest audit docs` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

- Baseline: `6a3af10`, the commit the m1 run read. Start from `git diff 6a3af10 -- README.md CONTRIBUTING.md justfile '*/justfile' flake.nix app/src api/src dev`.
- Scope: `README.md`, justfile recipe comments, `dev/` config comments, code and doc comments under `app/src` and `api/src`, and the user-facing pages `app/src/about.tsx` and `app/src/privacy.tsx`. `AGENTS.md`, `CONTRIBUTING.md`, `REVIEW.md`, and skills belong to the `instructions` audit; `moq/` docs belong upstream.
- Check first: README claims against `flake.nix` and `dev/justfile` (ports, processes, tools), since removals (Tauri, staging, `infra/`) left stale README text and dead files behind in m1.
- Check `privacy.tsx` against every third party the browser or API contacts: relays, model downloads, and sign-in providers.
- `scripts/check-export-docs.ts` only checks that each export in `app/src` and `api/src` has a comment, so read whether those comments still match their code.

## Audit

- docs

## Required

- [m1](/quest/m1/README.md) - run once per milestone, after m1 finishes

## Scheduled

- 2026-12-02 - one week after the m1 run, so a fast-closing milestone does not rerun it at once
