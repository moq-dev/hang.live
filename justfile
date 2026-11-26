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

# Run the CI checks
check:
	#!/usr/bin/env bash
	set -euo pipefail
	bun install --frozen-lockfile
	quest check
	bun fallow dead-code --unused-deps
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

# Deploy the live API and app to Cloudflare.
deploy:
	just api deploy
	just app deploy
