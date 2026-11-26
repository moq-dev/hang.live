# [M] Deploy hang.live on merge

## Goal

Every merge to `main` deploys the API (D1 migrations, then the Worker) and the app to `hang.live` without a person, and a post-deploy smoke check fails loudly when the live site breaks.
`just deploy` stays as the manual path for a hotfix or a rollback.

## Plan

- A workflow on `push` to `main`, plus `workflow_dispatch` for redeploys, on GitHub-hosted `ubuntu-latest` (the repository is public).
  It runs in a `production` environment restricted to `main` and holding `CLOUDFLARE_API_TOKEN`, with `permissions: contents: read`, and is the only job that sees the token; PR CI stays read-only.
- Use `concurrency: deploy` with `cancel-in-progress: false` and `queue: max`, so every merge deploys in order instead of a newer run cutting one off between migration and Worker, or replacing a pending one.
- Check out with `submodules: recursive` like `Check`, plus `lfs: true`: `app/public` media is Git LFS, and `Check` skips LFS, so a plain checkout would ship pointer files.
- Run `nix develop --command bash -c 'bun install --frozen-lockfile && just deploy'`, since `just deploy` installs nothing, without the Actions Nix cache, which the first cost audit measured as slower than none.
- Migrations run before the new Worker, so each must work with the Worker already live; `api/AGENTS.md` already keeps them additive.
- Smoke check after the deploy: `https://api.hang.live/health` and `https://hang.live` must answer 200, and the job fails otherwise.
  Rollback is `wrangler rollback --env live` for the Worker; the job prints that command when the smoke check fails.
- Seed the environment secret from bws `cloudflare-admin-token` with `gh secret set --env production`, passing the value by command substitution.
- After the first green deploy, drop the "deploy `main`" steps from quests that wait on a manual deploy, such as [Chat window only](/quest/m1/chat-window-only.md) and [MoQ demos](/quest/m1/moq-dev-demos.md).

## Waiting

- Maintainer: widen bws `cloudflare-admin-token` to D1 Edit and Workers Scripts Edit on the production account and Workers Routes Edit on the `hang.live` zone (in progress 2026-11-25).
  An agent cannot grant Cloudflare permissions; check with `bunx wrangler d1 migrations list DB --env live --remote` under the token, then let this quest's first deploy prove the Workers permissions.

## Related

- [Chat window only](/quest/m1/chat-window-only.md) - waits on the same token to deploy `main`
- [Audit build and CI cost](/quest/m2/audit-cost.md) - weighs the deploy job's minutes on its next run
