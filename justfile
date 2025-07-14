#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	pnpm -r i

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

# Deploy the site to Cloudflare Pages
deploy: build
	pnpm wrangler pages deploy dist

dev:
	pnpm -r i

	# No watch because it defaults to the entire repo, including the backend.
	pnpm -r tauri dev --no-watch
