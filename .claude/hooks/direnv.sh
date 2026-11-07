#!/usr/bin/env bash
set -eu

[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
[ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0
command -v direnv >/dev/null 2>&1 || exit 0
[ -f "$CLAUDE_PROJECT_DIR/.envrc" ] || exit 0

# Check approval before the shared exporter can call direnv allow.
direnv exec "$CLAUDE_PROJECT_DIR" true
exec "$CLAUDE_PROJECT_DIR/moq/.claude/hooks/direnv.sh"
