# Hang

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and pull requests.
Trust the pinned `moq/` source over published API references.

# Development

- Use Bun workspaces; `@moq/*` packages come from the pinned `moq/` submodule, never npm.
- Keep reusable media and protocol changes upstream in `moq-dev/moq` and application behavior here.
- Start `just dev` only to validate a change on its real surface, and stop it when done.
- Keep the SessionStart direnv hook in `.claude/settings.json`; worktree creation is host-managed.

Quests: before any work, run `quest context` and follow it, unless this session already holds its rules.
