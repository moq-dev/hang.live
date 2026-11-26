# [S] Add hang.live back to moq.dev demos

## Goal

Once Hang is reliable, hardened, and running on `moq.pro`, `hang.live` is listed
again across `moq.dev` and the MoQ documentation demos so visitors can try a
full spatial multi-participant MoQ application live.

## Plan

Decided 2026-11-25 (maintainer): add Hang back to `moq.dev` demos once it is
fixed up.

- **Prerequisite:** land and deploy [m0](/quest/m0/README.md) and the rest of
  [m1](/quest/m1/README.md) (security/auth hardening, media-toggle recovery,
  deduplicated watch pipelines and spatial audio, WebGL/UI/API bugfixes, and
  [retiring the self-hosted relays](/quest/m1/retire-relay-nodes.md)).
- Verify `https://hang.live` end to end in a real browser against `moq.pro`
  (landing page demo, guest join, camera/mic toggle recovery, screen share,
  chat/memes, and room previews).
- Open a follow-up PR in `moq-dev/moq` linking `https://hang.live` back into the
  demo listings:
  - `doc/bin/demo.md` (alongside Web demo, MoQ Boy, and CARLA)
  - `doc/setup/examples.md` and `doc/index.md` (conferencing / `@moq/room` live
    demo)
  - `demo/web/` ("Other demos" links on `moq.dev`)
- Keep Hang's own landing/about links pointing to `https://moq.dev` and
  `https://github.com/moq-dev/moq` so visitors can move cleanly between both
  sites.
