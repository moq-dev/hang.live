# [L] Deploy staging on merge and production on release

## Goal

Every merge to `main` deploys the API (D1 migrations, then the Worker) and the app to a staging environment at `new.hang.live` without a person.
Every change to a moq-style `release` branch deploys them to production at `hang.live` the same way.
A post-deploy smoke check fails each deploy loudly when its site breaks.
`just deploy <env>` stays as the manual path for a hotfix or a rollback.

## Plan

Decided 2026-11-26 (maintainer, /quest-run):
- ✅ Deploy staging on every merge to `main` and production on release (rejected: production on every merge to `main`).
- ✅ Staging host `new.hang.live` (rejected: `staging.hang.live`, reviving `hang.now`, `*.workers.dev`).
- ✅ Release trigger: a moq-style `release` branch (rejected: GitHub Release tags, a manual `workflow_dispatch` promote).
- ✅ Staging relay key: a separate key that moq.pro trusts only for the `staging` root, so unreleased code on `main` cannot mint tokens for production rooms (rejected: reusing production's `RELAY_SECRET`, which would let staging sign tokens for `hang` rooms).
- ✅ Staging sign-in: point the old `hang.now` Google, Discord, and Apple (`now.hang.api`) sign-in apps, whose IDs are in [#31](https://github.com/moq-dev/hang.live/pull/31)'s diff, at `new.hang.live` and store their secrets in bws (rejected: guest-only staging).

Decided 2026-11-26 (maintainer away, /quest-run coordinator on the implementer's recommendation): accepted the review finding on commit order for queued deploys; this quest settles it when building the workflow, for example by skipping a run whose commit is no longer its branch's head (rejected: a deployment-cursor design up front).

Staging environment.
The `hang.now` staging environment was removed as obsolete in [#31](https://github.com/moq-dev/hang.live/pull/31); its diff lists the removed config. This re-adds one:
- A `staging` env in `api/wrangler.jsonc`: Worker `api-hang-staging` on `api.new.hang.live`, its own D1 `db-hang-staging` and R2 `public-hang-staging` (served at `public.new.hang.live`), so staging migrations and uploads never touch production data.
  Recommended over sharing production's D1: migrations then run on staging one release before production, which tests them against a live Worker.
- A `staging` env in `app/wrangler.jsonc`: Worker `hang-staging` on `new.hang.live`.
- `app/.env.staging` with the `new.hang.live` origins, built by `vite build --mode staging`; [#57](https://github.com/moq-dev/hang.live/pull/57) deleted the leftover `hang.now` one.
- `RELAY_URL` stays `https://cdn.moq.dev` (moq.pro), with `RELAY_PREFIX` `staging` so staging rooms never share production's `hang` broadcasts.
- `AUTH_SECRET` is a fresh random value for staging, set with `wrangler secret put --env staging`.
- `RELAY_SECRET` for staging is a new key, set with `wrangler secret put --env staging` and never shared with production.
- The sign-in apps' redirect URIs move to `new.hang.live`; an agent can edit them by driving the maintainer's signed-in browser. Their secrets go from bws into `wrangler secret put --env staging`.
- Restore `just deploy <env>` (and `just api deploy <env>`, `just app deploy <env>`) taking `staging` or `live`, and regenerate `api/worker-configuration.d.ts`.

Release branch, modeled on moq's (`RELEASE.md`, `.github/workflows/release-gate.yml`, and the `release` ruleset in moq-dev/moq):
- `main` is the trunk and `release` is what ships.
  A release is a PR merging `main` into `release` with a merge commit; a serious fix lands on `main` first and is then ported to `release` as its own PR.
  Hang has no versions or changelogs, so it skips moq's pre-cut merge of `release` into `main`.
- `Check` also runs on PRs into `release`.
- A `Release gate` job on PRs into `release` compares trees, not commits: it passes only when the PR's merge candidate (`refs/pull/<n>/merge`) has the same tree as a `main` commit with a green staging deploy, so production only receives a tree staging already ran and smoke-checked, even when `release` holds a backport `main` later reverted.
  It runs on the same runners as `Check`, moving with it to the self-hosted merge gate kixel-ai/quest is planning.
- A backport's tree never ran on staging, which tracks `main`, so the gate passes one only once the maintainer approves it, rerunning on `pull_request_review`, as the explicit override; its production smoke check and `wrangler rollback` are its safety net.
  Rejected: deploying backport heads to staging, which would roll staging back from `main` until the next merge.
- The `release` ruleset mirrors moq's: no deletion or force push, a PR required, and `Check` plus `Release gate` required.
  Unlike moq's, it requires the branch to be up to date, so the merged tree is the one the gate checked; releases are rare enough that the re-run costs nothing.
  Add it through dotfiles' `bin/repo-settings`, where the org rulesets live, not by hand.
- Document cutting a release and backports in `CONTRIBUTING.md`.

Cloudflare credentials.
bws `cloudflare-admin-token` is an account-owned token (`cfat_`, verified 2026-11-27 with `/accounts/<id>/tokens/verify`) holding D1, Workers Scripts, and Workers R2 Storage write on the account plus Zone Read and Workers Routes write on the `hang.live` zone, which covers production and staging (same account and zone).
Wrangler needs `CLOUDFLARE_ACCOUNT_ID` set alongside it, locally and in each GitHub environment.
The token has no DNS Edit. Cloudflare documents Workers Routes write, not DNS Edit, as what a Worker custom domain needs, since Cloudflare creates its DNS record and certificate, so `new.hang.live` and `api.new.hang.live` should deploy as is.
Attaching `public.new.hang.live` to the R2 bucket is the least certain step: if it or the first staging deploy fails with an authentication error, ask the maintainer to add DNS Edit on the `hang.live` zone.

Deploy workflow:
- One workflow on `push` to `main` (staging) and to `release` (production), plus `workflow_dispatch` for redeploys, on GitHub-hosted `ubuntu-latest` (the repository is public and this is not a merge gate).
  Each target runs in its own GitHub environment holding `CLOUDFLARE_API_TOKEN`: `staging` restricted to `main` and `production` restricted to `release`, with `permissions: contents: read`; PR CI stays read-only.
- `concurrency` per target with `cancel-in-progress: false` and `queue: max`, so a newer run never cuts one off between migration and Worker or replaces a pending one; settle commit order as decided above.
- Check out with `submodules: recursive` like `Check`, plus `lfs: true`: `app/public` media is Git LFS, and `Check` skips LFS, so a plain checkout would ship pointer files (`just deploy` now refuses them).
- Run `nix develop --command bash -c 'bun install --frozen-lockfile && just deploy <env>'`, since `just deploy` installs nothing, without the Actions Nix cache, which the first cost audit measured as slower than none.
- Migrations run before the new Worker, so each must work with the Worker already live; `api/AGENTS.md` already keeps them additive.
- Smoke check after each deploy, failing the job otherwise: the API origin's `/health` answers 200, and the app origin's `/` serves exactly the `app/dist/index.html` this run built, whose hashed main bundle also answers 200.
  A bare 200 from the app origin proves nothing, since its single-page-application fallback answers any path with `index.html`.
  Then `just smoke <app origin>` joins one room from two headless Chromium pages with fake cameras and checks each sees the other, naming the step that broke; run it on staging too, so the green staging deploy the release gate requires includes it.
  It needs the dev shell's Chromium, which `nix develop` already provides.
  Rollback is `wrangler rollback --env <env>` for the Worker; the job prints that command when either check fails.
- Point the hourly `Production smoke` workflow's checkout at `release` once it exists, so it tests production with the smoke that shipped with it rather than `main`'s, whose selectors may already expect unreleased UI.
- Seed each environment's secret from bws `cloudflare-admin-token` with `gh secret set --env <environment>`, passing the value by command substitution.
- After the first green production deploy, drop the "deploy `main`" steps from quests that wait on a manual deploy, such as [MoQ demos](/quest/m1/moq-dev-demos.md).

## Waiting

- moq.pro: trust Hang's staging relay key for the `staging` root only, and nothing under `hang`. The maintainer advances it once the staging API has its own `RELAY_SECRET`. Check: two tabs joining a `new.hang.live` room see each other, and a staging token for a `hang/` path is refused.
- Maintainer (action): store the secrets of the old `hang.now` Google, Discord, and Apple (`now.hang.api`) sign-in apps, Apple's private key included, in bws under names for Hang staging, so staging sign-in can be configured. An agent cannot: this host's bws machine account is read-only, and bws holds none of them yet. Check: `bws secret list | jq -r '.[].key'` lists them.

## Related

- [Audit build and CI cost](/quest/m2/audit-cost.md) - weighs the deploy jobs' minutes on its next run
