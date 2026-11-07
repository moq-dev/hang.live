# Hang

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and pull requests.
Trust the pinned `moq/` source over published API references.

Quests: before any work, run `quest context` and follow it.
The CLI, guide, and skills come from MoQ's Quest flake input; upgrade them upstream and bump MoQ here.

# Development

- Use Bun workspaces; `@moq/*` comes from the pinned submodule.
- Keep reusable media/protocol changes in MoQ and application behavior here.
- Prefer ESM namespace imports and explicit types; do not use `any` or type escape hatches.
- Use Biome's configured formatting.
- Do not start `just dev` unless requested.

`quest init` may install Claude worktree hooks in the pinned version. Keep the
SessionStart direnv hook in `.claude/settings.json`; worktree creation is managed
by the host.
