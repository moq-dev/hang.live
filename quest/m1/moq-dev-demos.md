# [S] Add hang.live back to moq.dev demos

## Goal

Once Hang is reliable, hardened, and running on `moq.pro`, `hang.live` is listed
again across `moq.dev` and the MoQ documentation demos so visitors can try a
full spatial multi-participant MoQ application live.

## Plan

Decided 2026-11-25 (maintainer): add Hang back to `moq.dev` demos once it is
fixed up.

- Cut a [release](/CONTRIBUTING.md#releases) if `hang.live` is behind `main`, then verify
  `https://hang.live` end to end in a real browser against `moq.pro`
  (landing page demo, guest join, camera/mic toggle recovery, screen share,
  chat/memes, and room previews).
- Open a follow-up PR in `moq-dev/moq` linking `https://hang.live` back into the
  demo listings:
  - [`doc/bin/demo.md`](/moq/doc/bin/demo.md) (alongside Web demo, MoQ Boy, and CARLA)
  - [`doc/setup/examples.md`](/moq/doc/setup/examples.md) and [`doc/index.md`](/moq/doc/index.md) (conferencing / `@moq/room` live
    demo)
  - [`demo/web/`](/moq/demo/web/README.md) ("Other demos" links on `moq.dev`)
- Keep Hang's own landing/about links pointing to `https://moq.dev` and
  `https://github.com/moq-dev/moq` so visitors can move cleanly between both
  sites.
