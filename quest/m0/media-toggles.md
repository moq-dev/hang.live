# [M] Recover audio and video after repeated input toggles

## Goal

Enabling a camera or microphone after disabling it resumes local capture and
remote playback without reloading or rejoining. Pending permission prompts,
failed capture, device changes, and teardown must not leave the input stuck.

## Plan

The maintainer reports that toggling audio/video inputs can leave them stuck
forever. This was not reproduced end to end during the dependency migration;
do not close this quest based only on the newer MoQ version or passing source tests.
The AFK instruction authorizes this recommended m0 scope.

Trace `app/src/room/local.ts`, `app/src/components/profile.tsx`, and
`app/src/controls.tsx` from requested settings through `Local.core` to
capture tracks, encoder state, catalog changes, and a second participant's decoder.
Record which stage stops progressing in a reproducible browser case.

The upgraded MoQ keeps muted microphones subscribed and disabled video renditions
in the catalog. Its Effects await spawned tasks before rerunning, so every
pending capture/read needs unconditional cancellation cleanup. Start from the
pinned `moq/js/publish/src/source`, `moq/js/publish/src/{audio,video}/capture.ts`,
and `moq/js/room/src/local.ts`; upstream shared lifecycle fixes in MoQ rather than
copying the pipeline into Hang.

The upgraded source's `retry.test.ts` passes, including cancellation and explicit
reenable after errors. Reuse that coverage: it does not exercise Hang's controls,
the encoder graph, or a remote player's recovery.

Cover repeated off/on, a toggle while getUserMedia is pending, rejection followed
by retry, switching/removing a device, and leaving while capture is pending.
Verify the next successful enable yields fresh tracks and actual remote media,
and disabled/closed tracks and graphs are released. Use deterministic deferred
capture tests for races plus a browser integration regression for capture through
remote decode. A camera preview alone is insufficient evidence for remote audio.

Distinguish requested, pending, live, and failed state in the UI using capture
outputs and errors. A terminal failure should offer a working retry rather than
an endless spinner. Choose the smallest fix supported by the reproduction;
do not add a retry loop or arbitrary timeout to conceal an unresolved wait.
