# [S] Remove self-hosted relay infra in favor of moq.pro

## Goal

Production Hang uses `moq.pro` for relay delivery and carries no stale
self-hosted relay Nix/systemd deployment code.

## Plan

Decided 2026-11-25 (maintainer): delete the self-hosted `infra/` setup and use
`moq.pro` instead.

- Remove `infra/` (which still pins `github:kixelated/moq/ietf?dir=rs`, builds
  the old `hang-cli` binary, and compiles production relays with
  `-C debug-assertions=on`) and drop `mod infra` from `justfile`.
- Update production relay configuration (`api/wrangler.jsonc` `env.live.vars`
  `RELAY_URL` / `RELAY_PREFIX`, plus any secret/documentation references in
  `README.md` and `CONTRIBUTING.md`) to target `moq.pro`.
- Keep `dev/` (`just dev` local `moq-relay` + `moq auth serve`) intact for
  offline local development and integration tests.
- Verify `just check` and `just build` pass with `infra/` removed.
