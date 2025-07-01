#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Setup the database and API.
setup:
	just --justfile backend/justfile setup

dev:
	cd frontend && pnpm i

	# Then run the relay with a slight head start.
	# It doesn't matter if the web beats BBB because we support automatic reloading.
	./frontend/node_modules/.bin/concurrently --kill-others --names back,front --prefix-colors auto \
		"just --justfile backend/justfile dev" \
		"sleep 1 && just --justfile frontend/justfile dev"

# Run the CI checks
check:
	just --justfile frontend/justfile check
	just --justfile backend/justfile check

# Automatically fix some issues.
fix:
	just --justfile frontend/justfile fix
	just --justfile backend/justfile fix

# Upgrade any tooling
upgrade:
	just --justfile frontend/justfile upgrade
	just --justfile backend/justfile upgrade

# Build the packages
build:
	just --justfile frontend/justfile build
	just --justfile backend/justfile build
