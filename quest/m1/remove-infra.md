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
- Verify production relay configuration (`api/wrangler.jsonc` `env.live.vars`
  already points `RELAY_URL` to `https://cdn.moq.dev` and `RELAY_PREFIX` to
  `hang` for `moq.pro`) and update any stale self-hosted relay references in
  `README.md` and `CONTRIBUTING.md`.
- Before removing the old relay deployment, confirm that `moq.pro` accepts join
  tokens signed with the live `RELAY_SECRET` (`npx wrangler secret put
  RELAY_SECRET --env live`), or rotate it to a key that `moq.pro` trusts.
- Keep `dev/` (`just dev` local `moq-relay` + `moq auth serve`) intact for
  offline local development and integration tests.
- Verify `just check` and `just build` pass with `infra/` removed.
