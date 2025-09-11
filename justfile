#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	pnpm install --frozen-lockfile
	pnpm -r run check

	cd native && just check
	cd moq && just check

# Automatically fix some issues.
fix:
	pnpm install
	pnpm dedupe
	pnpm -r run fix

	cd native && just fix
	cd moq && just fix

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	pnpm self-update
	pnpm -r update
	pnpm -r outdated

# Build the packages
build:
	pnpm install --frozen-lockfile
	pnpm -r run build

prod: build
	pnpm -r run prod

deploy env="staging":
	cd api && just deploy "{{env}}"
	cd app && just deploy "{{env}}"

dev:
	pnpm install
	@cd moq/rs && just auth-token
	pnpm concurrently --kill-others --names api,app,moq --prefix-colors auto \
		"cd api && just dev" \
		"cd app && just dev --open" \
		"cd moq && just root"

native:
	pnpm install
	@cd moq/rs && just auth-token
	pnpm concurrently --kill-others --names api,app,moq --prefix-colors auto \
		"cd api && just dev" \
		"cd native && just dev" \
		"cd moq && just root"
