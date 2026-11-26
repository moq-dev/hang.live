# [M] End-to-end encrypted private rooms

## Goal

Participants can create or join a private room whose media, spatial positions,
chat, and track names are end-to-end encrypted client-side under a key held
only in the URL `#fragment`, so `api/` and the relay see only opaque names and
ciphertext.

## Plan

Build on [`@moq/e2ee`](/moq/js/e2ee/README.md), which implements the
[`moq-e2ee-01-wip` profile](/moq/drafts/draft-lcurley-moq-e2ee.md) at the
pinned `moq/`. There (and upstream `main` on 2026-11-25), `@moq/publish`,
`@moq/watch`, and `@moq/room` do not use it yet. Sender signing is out of
scope (maintainer, 2026-11-26): the profile leaves it out, and no `moq-sign`
profile exists.

- Add `@moq/e2ee` to Hang's workspace once its browser integration is ready,
  and upstream any missing `@moq/room` / `@moq/publish` / `@moq/watch` E2EE
  wiring into `moq-dev/moq` rather than reimplementing them in Hang.
- Support a "Private (E2EE)" toggle when starting a room that generates a room
  credential and embeds it in the URL `#fragment` (never sent to `api/` or the
  relay).
- Follow the pinned profile's credential, opaque broadcast path, and epoch
  rules: each publisher instance mints a fresh epoch, announced as the route's
  instance rather than in the path, never reused under one credential across
  runs or restarts. Encrypt media and Hang's `location`/`chat` tracks.
  Only `moq-lite-07-wip`, which `@moq/net`'s default versions leave out, carries
  the publisher's instance end to end; older Lite versions resolve their own,
  so subscribers could not derive keys. Private rooms connect with versions
  that preserve the instance and refuse a session that negotiates any other.
  Every relay hop must accept such a version too, alongside the defaults public
  rooms use: the pinned relay leaves `moq-lite-07-wip` out by default, so
  enable it in `dev/root.toml` and confirm `cdn.moq.dev` accepts it.
- Display a clear lock indicator in the room header and warn users
  if they open an E2EE room link without a key fragment.
- Verify in tests that relay-visible paths/payloads carry no plaintext room
  metadata, chat, or media frames.
