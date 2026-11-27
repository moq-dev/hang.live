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
deploy env: (package env) (ship env)

# Build the app for an environment, staging or live, without credentials or deploying anything.
package env:
	@case "{{env}}" in staging|live) ;; *) echo "error: deploy to staging or live, not {{env}}" >&2; exit 1 ;; esac
	just app lfs
	just app build "{{env}}"

# Apply D1 migrations, deploy the API and the packaged app to an environment, then check the deployed site.
ship env:
	#!/usr/bin/env bash
	set -euo pipefail
	case "{{env}}" in staging|live) ;; *) echo "error: deploy to staging or live, not {{env}}" >&2; exit 1 ;; esac
	source "app/.env.{{env}}"
	# Refuse a build packaged for another environment before anything changes.
	if ! grep -rqF "$VITE_API_URL" app/dist/assets; then
		echo "error: app/dist was not packaged for {{env}}; run just package {{env}}" >&2
		exit 1
	fi
	api="(cd api && bun wrangler rollback --env {{env}})"
	app="(cd app && bun wrangler rollback --env {{env}})"
	trap 'echo "error: deploying {{env}} failed before any Worker changed" >&2' ERR
	(cd api && bun wrangler d1 migrations apply DB --env "{{env}}" --remote)
	# A Worker's version changes only once its upload succeeds, after which only its trigger update can still fail.
	trap 'echo "error: deploying {{env}} failed; roll back the API Worker with: $api only if the output above shows it uploaded a version" >&2' ERR
	(cd api && bun wrangler deploy --env "{{env}}")
	trap 'echo "error: deploying {{env}} failed; roll back the API Worker with: $api, and the app Worker with: $app only if the output above shows it uploaded a version" >&2' ERR
	(cd app && bun wrangler deploy --env "{{env}}")
	trap - ERR
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
	# The site serves this build, so a failed join may be the relay's (or its trust of this env's key), not the deploy's.
	trap - ERR
	if ! just smoke "$VITE_APP_URL"; then
		echo "error: {{env}} serves this build, but two browsers could not join a room; check the app, the API, and the relay before rolling back" >&2
		exit 1
	fi
