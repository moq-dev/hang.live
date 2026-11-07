# Development

Hang uses Bun workspaces, a SolidJS frontend (`app/`), a Hono API on
Cloudflare Workers (`api/`), and Tauri (`native/`). Media libraries live in
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

`just check` runs Quest validation, TypeScript, Biome, API and app tests, and native checks. On Linux,
the native recipe checks Rust formatting; native compilation needs GTK and
WebKit development libraries and is not part of that recipe.

Run expensive checks with `quest gate just check` and `quest gate just build`.
`just fix` applies formatting and lint fixes. `just dev` starts the API,
frontend, local relay, and auth service; start it only when requested.
App builds also refresh the pinned decoder assets, including through `just deploy`.

# MoQ updates

Update the `moq/` gitlink and `inputs.moq.url` in `flake.nix` to the same
upstream commit. Run `nix flake lock`, update the Bun lockfile with `bun install`,
and migrate against that checkout's source and `MIGRATE.md` guides. Generic
media fixes belong upstream; pin a published upstream commit rather than
leaving local-only submodule commits.

# Quests

Run `quest context` before work and `quest guide` before changing a quest.
The plans under `quest/` are the backlog. Use `quest skill plan` to scope
work and `quest check` to validate it. The skills installed for Codex and
Claude Code are stubs served by the pinned binary; rerun `quest init` after
upgrading it. Keep only the SessionStart hook in `.claude/settings.json` if
that version generates worktree hooks. It reuses MoQ's direnv hook with Hang's
project directory. Claude Code imports the same root instructions as Codex.

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
