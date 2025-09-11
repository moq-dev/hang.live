#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	bun install --frozen-lockfile
	bun run --filter='*' check
	cd native && just check

# Automatically fix some issues.
fix:
	bun install
	bun run --filter='*' fix
	cd native && just fix

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun update
	bun outdated

# Build the packages
build:
	bun install --frozen-lockfile
	bun run --filter='*' build

prod: build
	bun run --filter='*' prod

deploy env="staging":
	cd api && just deploy "{{env}}"
	cd app && just deploy "{{env}}"

dev:
	bun install
	@cd moq/rs && just auth-token
	bun concurrently --kill-others --names api,app,moq --prefix-colors auto \
		"cd api && just dev" \
		"cd app && just dev --open" \
		"cd moq && just root"

native:
	bun install
	@cd moq/rs && just auth-token
	bun concurrently --kill-others --names api,app,moq --prefix-colors auto \
		"cd api && just dev" \
		"cd native && just dev" \
		"cd moq && just root"
