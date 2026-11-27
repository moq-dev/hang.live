#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

mod api
mod app
mod dev

# List all of the available commands.
default:
  just --list

# Install workspaces and prepare decoder assets and API declarations.
install:
	bun install --frozen-lockfile
	bun run --cwd app deps

# Run every check; no CI runs them on pull requests, so run this before pushing.
check:
	#!/usr/bin/env bash
	set -euo pipefail
	bun install --frozen-lockfile
	quest check
	bun fallow dead-code
	bun run check
	bun run --cwd api test
	bun run --cwd app test
	bun run --cwd app test:media

# Automatically fix some issues.
fix:
	bun install
	bun run --cwd api fix
	bun run --cwd app fix

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun update
	bun outdated

# Build the packages
build:
	bun install --frozen-lockfile
	bun run build

# Join a deployed site, such as https://hang.live, from two headless browsers and check each sees the other.
smoke origin:
	bun run --cwd app smoke "{{origin}}"

# Deploy the live API and app to Cloudflare.
deploy:
	just app lfs
	just api deploy
	just app deploy
