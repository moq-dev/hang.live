#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	bun install --frozen-lockfile
	bun run --filter='*' --elide-lines=0 check
	cd native && just check

# Automatically fix some issues.
fix:
	bun install
	bun run --filter='*' --elide-lines=0 fix
	cd native && just fix

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun update
	bun outdated

# Build the packages
build:
	bun install --frozen-lockfile
	bun run --filter='*' --elide-lines=0 build

prod: build
	bun run --filter='*' --elide-lines=0 prod

deploy env="staging":
	cd api && just deploy "{{env}}"
	cd app && just deploy "{{env}}"

dev:
	bun install
	@cd moq/rs && just auth-token
	bun concurrently --kill-others --names api,app,moq --prefix-colors auto \
		"cd api && just dev" \
		"cd app && just dev" \
		"cd moq && just root"

native:
	cd native && just dev

# Run the emulator, or use --open for Android Studio
android flags="":
	cd native && just android {{flags}}

ios:
	cd native && just ios
