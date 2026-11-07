# Room reliability

## Goal

Participants can repeatedly enable and disable media, trust room presence, and
keep their audio settings when returning to Hang.

## Plan

Prioritize the maintainer's reported media-toggle hang, then the independently
verified presence and volume bugs. Each child is independently shippable.

## Required

- [Correct favorite presence](/quest/m0/favorite-presence.md) - each room and the app badge show current participants
- [Preserve speaker gain](/quest/m0/speaker-volume.md) - supported volume survives reload and mute cycles
