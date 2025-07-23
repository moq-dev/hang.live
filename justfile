#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	pnpm -r i

	# Run the checks
	pnpm -r run check

	# Lint the JS packages
	pnpm -r exec biome check

	# Make sure Typescript compiles
	pnpm -r run check

	# Make sure the JS packages are not vulnerable
	pnpm -r exec pnpm audit

	# TODO: Check for unused imports (fix the false positives)
	# pnpm -r exec knip --no-exit-code

# Automatically fix some issues.
fix:
	# Fix the JS packages
	pnpm -r i

	# Format and lint
	pnpm -r exec biome check --fix

	# Some additional linting.
	pnpm -r exec eslint . --fix

	# Make sure the JS packages are not vulnerable
	pnpm -r exec pnpm audit --fix

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
	pnpm -r i
	pnpm -r run build

prod: build
	pnpm -r run prod

deploy env="staging":
	just --justfile api/server/justfile deploy "{{env}}"
	just --justfile app/justfile deploy "{{env}}"

dev:
	pnpm -r i

	pnpm concurrently --kill-others --names api,app --prefix-colors auto \
		"just --justfile api/server/justfile dev" \
		"just --justfile app/justfile dev"
