#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	pnpm i

	# Make sure Typescript compiles
	pnpm -r run check

	# Lint the JS packages
	pnpm -r exec biome check

	# Check the Rust code
	just --justfile native/justfile check

	# Check the moq submodule
	cd moq && just check

	# TODO: Check for unused imports (fix the false positives)
	# pnpm -r exec knip --no-exit-code

# Automatically fix some issues.
fix:
	# Fix the JS packages
	pnpm i

	# Format and lint
	pnpm -r exec biome check --fix

	# Fix the Rust code
	just --justfile native/justfile fix

	# We don't fix the moq submodule; you should do that before committing.
	# cd moq && just fix

# Run any CI tests
test:
	# Run the JS tests via node.
	pnpm -r test

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	pnpm self-update
	pnpm -r update
	pnpm -r outdated

# Build the packages
build:
	pnpm i
	pnpm -r run build

prod: build
	pnpm -r run prod

deploy env="staging":
	just --justfile api/justfile deploy "{{env}}"
	just --justfile app/justfile deploy "{{env}}"

dev:
	pnpm i

	# Generate auth tokens if needed
	@cd moq/rs && just auth-token

	pnpm concurrently --kill-others --names api,app,native,relay --prefix-colors auto \
		"just --justfile api/justfile dev" \
		"just --justfile app/justfile dev" \
		"just --justfile native/justfile dev" \
		"just --justfile moq/justfile root"
