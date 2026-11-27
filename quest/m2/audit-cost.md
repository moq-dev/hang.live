# [L] Audit build and CI cost

## Goal

Run the `cost` audit: `quest audit cost` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

- Baseline from the first run (2026-11-25, `main` at 6a3af10 plus the run's fixes, GitHub-hosted `ubuntu-latest`, no Actions cache):
  - CI is one job, `Check`, about 95 s: checkout 7-11 s, Nix install 7-8 s, `nix develop` 24-27 s, `just check` 37-44 s, `just build` 4-5 s.
    Before the run it took 120-250 s; the magic-nix-cache setup and upload accounted for the difference.
  - Inside `nix develop`: nixpkgs source 7 s from cache.nixos.org, `moq` 7 s and `rust-overlay` 5.5 s to unpack (both needed to evaluate `moq/nixpkgs` and the relay), about 180 store paths 2.5 s.
  - Inside `just check`: `bun install` 3.4 s for 391 packages, `quest check` 0.2 s, API and app typecheck plus Biome about 7 s, unit tests about 2 s, the `moq-libav` Nix fetch 3-5 s, and `test:media` 14 s.
  - Locally (32 cores, load around 9), a warm `just check` takes 21 s, 13 s of it the media browser test, and incremental API and app checks take 2.3 s each.
    The media test spends about 1.6 s starting the relay, Vite, and Chromium; the rest is real capture-to-decode waits: three toggle cycles 3.1 s, held codecs 1.3 s, intent, deny, and device changes 5.6 s.
  - Artifacts: `app/dist` is 41 MB, 36 MB of it `meme/` (H.264 and VP9 pairs, picked by codec support), the main JS chunk 1.22 MB (381 KB gzip), and the libav worker 1.83 MB.
    The API Worker uploads 1.20 MB (216 KB gzip); `zod` is most of its dependency source.
- Rejected on the first run, so don't retry without new evidence:
  - magic-nix-cache, for the hosted `Check` job since removed: Actions cache entries are scoped to each PR, and CI never ran on `main`, so every PR re-uploaded the closure (72-133 s) into a cache pinned at its 10 GB cap.
    Even with the cache populated, `nix develop` took 36-39 s instead of 24-27 s.
  - Shortening the media test: every phase is real media round-trips guarding the m0 capture bugs; coverage cuts belong to the `tests` audit.
- Check first:
  - `Check` no longer runs on pull requests, so measure `just check` and `just build` locally, and the merge gate's step timings once one runs; the baseline above came from the old hosted `Check` job.
  - Whether a new flake input pulls a second nixpkgs; `nix flake archive --json --dry-run` lists every input's store path.
    `quest.inputs.nixpkgs-bun.follows` exists only until quest drops that input upstream.
  - Whether `moq-dev/moq` still makes evaluating its packages unpack `rust-overlay`.
  - Whether the deploy workflow from [Deploy staging and release](/quest/m1/deploy-staging-and-release.md) earns its minutes.

## Audit

- cost

## Required

- [m1](/quest/m1/README.md) - the audit runs once per milestone

## Scheduled

- 2026-12-02 - one week after the first run, so a fast milestone does not rerun it at once
