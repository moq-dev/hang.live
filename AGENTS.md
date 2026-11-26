# Hang

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and pull requests.
Trust the pinned `moq/` source over published API references.

# Development

- Use Bun workspaces; `@moq/*` packages come from the pinned `moq/` submodule, never npm.
- Keep reusable media and protocol changes upstream in `moq-dev/moq` and application behavior here.
- Prefer ESM namespace imports and explicit types.
- Do not start `just dev` unless requested.
- Keep the SessionStart direnv hook in `.claude/settings.json`; worktree creation is host-managed.

Quests: before any work, run `quest context` and follow it.
The `quest` binary is pinned by tag in `flake.nix`, separately from `moq`.
