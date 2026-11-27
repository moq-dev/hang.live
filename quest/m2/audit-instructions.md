# [XL] Audit agent instructions

## Goal

Run the `instructions` audit: `quest audit instructions` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

Baseline from the first run ([moq-dev/hang.live#60](https://github.com/moq-dev/hang.live/pull/60)): read through 2026-11-25 at `main` 6a3af10.

- Harnesses: Claude Code (Opus 5.5, Sonnet 5.5) wrote most PRs; Codex (GPT-6.1/6.2 Sol) reviewed; Antigravity (Gemini 4 Neon) wrote two.
- `quest messages` hosts, with the unnamed directories it dropped entries of: fedora 5, desktop 51, nixos 2, mini 1, kixtop 6.
- Loaded sizes:
  - Claude Code: root `AGENTS.md` 549 B; `app/AGENTS.md` 1,004 B and `api/AGENTS.md` 1,017 B on demand; 8 skill descriptions totaling 857 chars.
  - Codex and Antigravity: root `AGENTS.md` only; the `.agents/skills` descriptions also total 857 chars. Codex reads a nested file only when started under it; Antigravity never does.
- Guidance pages: every link in `quest guide prompting`, plus the Opus 5.5, Sonnet 5.5, GPT-6.2 Sol, and Antigravity skills pages, read 2026-11-25. No Gemini 4 or GPT-6.1 prompting page existed.
- Rules kept against the evidence:
  - `AGENTS.md` "never npm" for `@moq/*`: no session needed it, but no check stops a new `@moq/*` dependency from coming from npm.
  - `AGENTS.md` `just dev` rule: the maintainer chose its wording in #43, and every session since stopped the server.
- Out of scope here: the quest skill stubs and the `Quests:` reference line (kixel-ai/quest), and the user-level dev-shell and quest hooks (dotfiles).

Check first:
- Claude sessions load `app/AGENTS.md` and `api/AGENTS.md` after a Read tool call on a file there (not `rg` or `git diff`); they appear as PostToolUse hook context in transcripts. No `CLAUDE.md` has come back.
- No repository SessionStart hook has come back: #60 deleted the direnv one, since the user-level dev-shell hook loads the dev shell.

## Audit

- instructions

## Scheduled

- 2026-12-02 - one week after the first run, so a fast m1 does not rerun it at once

## Required

- [m1](/quest/m1/README.md) - runs once per milestone
