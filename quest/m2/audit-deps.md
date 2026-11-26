# [M] Audit dependencies

## Goal

Run the `deps` audit: `quest audit deps` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

- Baseline: the first run covered releases through 2026-11-25; review only releases after it.
- Out of scope: the `moq/` submodule and the `moq` flake input track `moq-dev/moq` and move only with a MoQ update (see `CONTRIBUTING.md`), so review their pin, not their dependencies.
  Advisories that reach Hang only through `moq/js/*` tooling, such as `typedoc`'s `minimatch`, belong upstream.
- Check first:
  - `bun audit --prod` for advisories in runtime dependencies (the API's `hono` and `drizzle-orm`, the chat path's `marked` and `dompurify`).
  - `playwright` stays pinned to the Nix shell's `playwright-driver` version; move it only with the nixpkgs pin.
  - `solid-js` 2 and `@solidjs/router` 2 wait on `vite-plugin-solid` and `babel-preset-solid` supporting Solid 2; Babel 8 waits on `babel-preset-solid` accepting `@babel/core` 8.
  - `kokoro-js` was stale on the first run; skip it if [TTS off kokoro-js](/quest/m2/tts-off-kokoro-js.md) replaced it.
- `just check` runs `fallow dead-code --unused-deps`, so unused dependencies fail the gate; it misses `@types/*` packages whose runtime package is gone and binaries nothing runs, so check those by hand.

## Audit

- deps

## Required

- [m1](/quest/m1/README.md) - the audit runs once per milestone

## Scheduled

- 2026-12-02 - one week after the first run, so a fast milestone does not rerun it at once
