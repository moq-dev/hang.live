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
- Hang is web-only: the Tauri app was deleted (maintainer, /quest-run).
- Use `moq.pro` for production relays, keeping `dev/` for local development.
- Structure work into three milestones run in order: `m0` for critical
  reliability, security, and MoQ media pipeline blockers; `m1` for `moq/`
  tooling modernization, infra removal, and remaining WebGL/UI/API bugs; `m2`
  for MoQ showcase features.
