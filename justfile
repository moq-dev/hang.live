#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

mod api
mod app
mod dev
mod native
mod infra

# List all of the available commands.
default:
  just --list

# Install workspaces and prepare decoder assets and API declarations.
install:
	bun install --frozen-lockfile
	bun run --cwd moq/js/libav build
	bun run --cwd api build

# Run the CI checks
check:
	#!/usr/bin/env bash
	set -euo pipefail
	bun install --frozen-lockfile
	quest check
	bun run check
	bun run --cwd api test
	bun run --cwd app test
	just native check

# Automatically fix some issues.
fix:
	bun install
	bun run --cwd api fix
	bun run --cwd app fix
	just native fix

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun update
	bun outdated

# Build the packages
build:
	just install
	bun run build

prod: build
	bun run --filter='@hang/*' prod

deploy:
	just api deploy
	just app deploy

# Run the Android build, using --open to open Android Studio
android *args:
	just native android {{args}}

# Run the iOS build, using --open to open Xcode
ios *args:
	just native ios {{args}}

# Release the app for the given platform
release platform:
	just native release "{{platform}}"
