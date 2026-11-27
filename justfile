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
	bun fallow dead-code
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

# Join a deployed site, such as https://hang.live, from two headless browsers and check each sees the other.
smoke origin:
	bun run --cwd app smoke "{{origin}}"

# Deploy the API and app to an environment, staging or live, then check the deployed site.
deploy env:
	@case "{{env}}" in staging|live) ;; *) echo "error: deploy to staging or live, not {{env}}" >&2; exit 1 ;; esac
	just app lfs
	just api deploy "{{env}}"
	just app deploy "{{env}}"
	just verify "{{env}}"

# Check that an environment serves this checkout's app build and a healthy API, then smoke-join it.
verify env:
	#!/usr/bin/env bash
	set -euo pipefail
	trap 'echo "error: {{env}} is broken; roll back both Workers with: (cd api && bun wrangler rollback --env {{env}}) && (cd app && bun wrangler rollback --env {{env}})" >&2' ERR
	source "app/.env.{{env}}"
	curl -fsS -o /dev/null "$VITE_API_URL/health"
	# The single-page fallback answers any path with index.html, so only this build's exact page proves the deploy.
	if ! curl -fsS "$VITE_APP_URL/" | cmp -s - app/dist/index.html; then
		echo "error: $VITE_APP_URL/ does not serve this build's app/dist/index.html" >&2
		false
	fi
	bundle=$(sed -n 's/.*<script type="module"[^>]* src="\([^"]*\)".*/\1/p' app/dist/index.html)
	if [ -z "$bundle" ]; then
		echo "error: app/dist/index.html names no module script" >&2
		false
	fi
	curl -fsS -o /dev/null "$VITE_APP_URL$bundle"
	just smoke "$VITE_APP_URL"
