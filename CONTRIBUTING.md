# Development

Hang uses Bun workspaces, a SolidJS frontend (`app/`), and a Hono API on
Cloudflare Workers (`api/`). Media libraries live in
the pinned `moq/` submodule. The Nix relay and JS libraries use the same MoQ
revision.

```sh
git submodule update --init --recursive
direnv allow
just install
just check
just build
```

The Nix shell supports Linux and Apple Silicon macOS, matching MoQ.
The API generates MoQ auth declarations before type-checking so Worker code
retains its stricter compiler settings without rechecking dependency internals.
The app reads the API's generated declarations so Worker globals do not collide
with browser DOM types. `just install` prepares both declaration boundaries.
The emits are incremental. App checks and builds refresh them, and `just dev`
watches API source changes so RPC types stay current during development.

`just check` runs Quest validation, a check for unused files, exports, types,
and dependencies (`fallow`), a check that every export in `app/src` and
`api/src` has a comment above it, TypeScript, Biome, and API, app, and media tests.

Run expensive checks with `quest gate just check` and `quest gate just build`.
`just fix` applies formatting and lint fixes. `just dev` starts the API,
frontend, local relay, and auth service.
App builds also refresh the pinned decoder assets, including through `just deploy`.

# Releases

`main` is the trunk and `release` is what ships. Every merge to `main` deploys
staging (`new.hang.live`), and every change to `release` deploys production
(`hang.live`): D1 migrations, the API Worker, then the app Worker. Each deploy
then checks the API's `/health`, that the site serves the exact build it
shipped, and `just smoke` joins a room from two browsers. Any failure fails
the run: a failed deploy or site check prints the `wrangler rollback`
commands, and a failed join, which may be the relay's, says so. Staging has
its own D1, R2, auth secret, and relay key, which can only sign tokens for
`staging/` rooms.

- Cut a release in two PRs. First merge `release` into `main` through a PR
  into `main`, since `release` must be up to date to merge and each release
  leaves a merge commit `main` lacks; its tree is `main`'s unless `release`
  holds a backport. Skip it while `main` already contains `release`. Then open
  a PR from `main` into `release` and merge it with a merge commit. The
  `Release gate` check passes only when the merged tree matches a `main`
  commit whose staging deploy succeeded; a release PR opened before that
  deploy finishes passes once the deploy reruns it.
- Open release PRs against `release`. A PR retargeted there runs no gate until
  it is closed and reopened, which also reruns `Check` against `release`.
- Land a serious fix on `main` first, then port it onto `release` as its own
  PR. Its tree never ran on staging, so the gate fails it; once `Check` passes,
  an admin merges it past the gate with `gh pr merge --merge --admin`. The
  production deploy's checks and `wrangler rollback` are its safety net.
- `just deploy staging` or `just deploy live` deploys the checkout by hand, for
  a hotfix or a rollback. It needs `CLOUDFLARE_API_TOKEN` with the deploy
  token, and Git LFS content (`git lfs pull`).
- The hourly `Production smoke` runs the smoke from `release`, so it tests
  production with the smoke that shipped with it.

# MoQ updates

Update the `moq/` gitlink and `inputs.moq.url` in `flake.nix` to the same
upstream commit. Run `nix flake lock`, update the Bun lockfile with `bun install`,
and migrate against that checkout's source and `MIGRATE.md` guides. Generic
media fixes belong upstream; pin a published upstream commit rather than
leaving local-only submodule commits.

# Quests

Run `quest guide` before changing a quest.
The plans under `quest/` are the backlog. Use `quest skill plan` to scope
work and `quest check` to validate it. The skills installed for Codex and
Claude Code are stubs served by the `quest` input in `flake.nix`, which names
no tag or revision; `flake.lock` alone pins it. A bot opens a PR bumping that
lock for each quest release. To upgrade by hand, run `nix flake update quest`,
then `nix develop --command quest init`, so a shell still holding the old
binary does not write its stubs. There is no `CLAUDE.md`:
Claude Code reads `AGENTS.md` itself, and a `CLAUDE.md` would stop it from
loading `app/AGENTS.md` and `api/AGENTS.md`.

# Pull requests

Target `main` with conventional-commit titles. Keep the description short,
with Problem, Approach, Impact, Alternatives, Follow-ups, and Validation.
Report public API and wire impact, including when there is none. Mark a
breaking change with `!` and explain migration.

Open a draft once scope is settled. Run local checks, commit, push the explicit
branch refspec, and run `quest review --base origin/main` before marking it
ready. Fix or refute findings with evidence and review the changed head again.
Record the implementing model and effort, the review, and any checks that
could not run. Do not rebase or force-push a published branch.
