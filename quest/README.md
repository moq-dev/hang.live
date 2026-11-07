# Hang quests

## Goal

Make joining a room and talking with friends reliable across browser media devices,
while keeping Hang's spatial UI simple and its shared media pipeline in MoQ.

## Plan

On 2026-11-06 the maintainer requested an unattended MoQ update, bug audit, and
Quest plans. Use the recommended scope and priority without waiting for an
interview: reliability bugs join m0, with the reported capture-toggle hang first.
These plans describe remaining work after the source upgrade; the upgrade alone
does not prove that the reported hang is fixed.

Existing work to assess before starting overlapping changes:
[moq-dev/hang.live#26](https://github.com/moq-dev/hang.live/pull/26) handles missing
WebGL2, and [moq-dev/hang.live#24](https://github.com/moq-dev/hang.live/pull/24)
addresses production Vite environment loading. Reuse those changes where applicable.

## Required

- [Room reliability](/quest/m0/README.md) - capture recovery, accurate presence, and persistent audio settings
