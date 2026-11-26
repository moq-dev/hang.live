# [M] Audit the quest tree

## Goal

Run the `tree` audit: `quest audit tree` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

- Baseline: the first run
  ([#58](https://github.com/moq-dev/hang.live/pull/58)) found the m2
  showcase quests planned against `moq/` APIs that are internal, renamed, or
  removed upstream. Check first every `moq/` API, package, and claim a quest
  names against the pinned submodule. `quest check` catches a removed path
  only when a quest links it (`/moq/...`), not a symbol or a backticked path.
- Check that each milestone's `Required` still encodes the maintainer's
  ordering (m2 after m1).
- Quests waiting on a deploy or the maintainer's machine: check whether
  the commit each waits on is live where it needs it before calling their
  plans stale.

## Audit

- tree

## Required

- [m1](/quest/m1/README.md) - runs once per milestone

## Scheduled

- 2026-12-02 - one week after the first run
