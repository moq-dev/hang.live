# Hang quests

## Goal

Make Hang a reliable, modern showcase for Media over QUIC: safe and solid across
browser media devices, aligned with `moq/` repository and SDK practices, and
demonstrating MoQ's unique capabilities while keeping shared media and protocol
logic upstream in `moq-dev/moq`.

## Plan

On 2026-11-06 the maintainer requested an unattended MoQ update, bug audit, and
Quest plans: reliability bugs joined m0, with the reported capture-toggle hang
first.

Decided 2026-11-25 (maintainer, modernization audit):
- Focus primary product effort on the web app and Cloudflare Workers API.
- Keep `native/` (Tauri) only as a lightweight canary for testing MoQ's
  Android/iOS/native libraries rather than as a consumer-facing demo.
- Delete `infra/` (self-hosted relay Nix/systemd setup) and use `moq.pro` for
  production relays instead, keeping `dev/` for local development.
- Structure work into three milestones: `m0` for critical reliability, security,
  and MoQ media pipeline blockers; `m1` for `moq/` tooling modernization, infra
  removal, and remaining WebGL/UI/API/native bugs; `m2` for MoQ showcase
  features.

## Required

- [m0: Room reliability and critical blockers](/quest/m0/README.md) - capture recovery, security hardening, deduplicated watch pipelines, and spatial audio fixes
- [m1: Modernization and bugfixes](/quest/m1/README.md) - `moq/` workflow and lint parity, `infra/` removal in favor of `moq.pro`, WebGL/UI/API bugfixes, native canary stability, and re-listing on `moq.dev` demos
- [m2: MoQ showcase features](/quest/m2/README.md) - Network X-Ray HUD, E2EE private rooms, BYO publisher/egress, live captions and AI voice agents, and datagram physics / 1:1 P2P
