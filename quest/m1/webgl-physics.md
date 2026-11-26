# [M] Fix WebGL resource leaks, avatar fallbacks, and spatial physics

## Goal

The spatial WebGL2 canvas runs smoothly without leaking GPU objects across
joins/leaves, recovers from context loss, displays fallback avatars accurately,
and simulates smooth, NaN-free physics only when visible.

## Plan

Fix the rendering and physics bugs found in the 2026-11-25 audit:

- **Eliminate VAO leaks & per-broadcast mesh buffers**
  (`app/src/room/gl/mesh.ts`, `app/src/room/gl/{broadcast,audio,border}.ts`):
  replace per-broadcast `MeshBuffer` allocations and never-evicted `#vaos` maps
  (which currently leak 3 VAOs per participant join/leave and re-upload
  `bufferData` on every drag/zoom) with two shared static meshes (unit quad +
  20×20 subdivided grid) owned by `GLContext` / the renderers.
- **Context loss & idle GPU usage** (`app/src/room/gl/context.ts`,
  `app/src/room/canvas.ts`, `app/src/index.tsx`, `app/src/components/profile.tsx`):
  handle `webglcontextlost` and `webglcontextrestored`; avoid spinning the 60fps
  background shader when on non-room pages or when hidden; avoid creating a full
  duplicate `AudioContext` + notification `.opus` fetches inside `Profile`'s
  `LocalPreview`.
- **Avatar rendering & fallback fixes** (`app/src/room/gl/broadcast.ts`,
  `app/src/room/video.ts`): read `broadcast.video.avatarSize.peek()` instead of
  testing the `Signal` object itself (`u_avatarActive` is currently always `1`),
  and remove the dead `avatar = new Image()` field in `Video` that prevents
  `#runAvatar` from ever falling back to `Api.randomAvatar()`.
- **Physics & peer-drag correctness** (`app/src/room/geometry.ts`,
  `app/src/room/broadcast.ts`, `app/src/room/space.ts`):
  - Guard `Vector.normalize()` against zero-length vectors so offline tiles at
    `(0, 0)` never become `NaN`, and add a deterministic tie-breaker when two
    colliding tiles share identical centers.
  - Remove the duplicate decay passes on `deformVelocity` and `zoomDeform` in
    `Broadcast.tick`.
  - Replace the always-on `setInterval(..., 1000 / 60)` in `Space` with a
    visibility-aware `@moq/clock` / `dt`-scaled step so hidden tabs stop burning
    CPU and physics is frame-rate independent.
  - Fix remote peer dragging in `Space.#publishPosition` so moving one peer does
    not clobber or permanently retain stale `peers.positions` overrides.

Add deterministic unit tests (using `Clock.Manual`) for zero-vector
normalization, collision repulsion, deformation decay, and cleanup.
