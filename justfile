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

# Run the CI checks
check:
	#!/usr/bin/env bash
	set -euo pipefail
	bun install --frozen-lockfile
	bun run check
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
	bun install --frozen-lockfile
	bun run build

prod: build
	bun run --filter='@hang/*' prod

deploy env="staging":
	just api deploy "{{env}}"
	just app deploy "{{env}}"

# Run the Android build, using --open to open Android Studio
android *args:
	just native android {{args}}

# Run the iOS build, using --open to open Xcode
ios *args:
	just native ios {{args}}

# Release the app for the given platform
release platform:
	just native release "{{platform}}"
