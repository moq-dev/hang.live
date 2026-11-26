# m0: Room reliability and critical blockers

## Goal

Joining a room, talking with friends, and authenticating are secure and reliable
across browser media devices, with a single shared MoQ pipeline per remote
participant and accurate spatial audio.

## Plan

Prioritize the maintainer's reported media-toggle hang alongside the critical
security/auth vulnerabilities and duplicated MoQ watch/audio bugs surfaced in
the 2026-11-25 audit. Each child is independently shippable.

## Required

- [Recover media toggles](/quest/m0/media-toggles.md) - audio and video resume without reloading
- [Preserve speaker gain](/quest/m0/speaker-volume.md) - supported volume survives reload and mute cycles
- [Harden OAuth, JWT auth, avatar uploads, and chat sanitization](/quest/m0/security-auth.md) - close open-redirect, email-linking, Apple callback, SVG XSS, stale-JWT 500, and chat tracking-pixel holes
- [Deduplicate remote watch pipelines and fix room audio](/quest/m0/room-media.md) - one watch pipeline per remote with shared downlink bandwidth, working mono panning, crash-free mute/unmute, validated metadata, and support banners
