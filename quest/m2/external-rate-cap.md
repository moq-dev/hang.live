# [XS] Cap external publishers' bitrate

## Goal

The publish token `POST /room/:room/external` mints carries a `@moq/auth`
bitrate cap (`publish: { path, rate }`), so a tool streaming into a hang is
paced by the relay.

## Plan

In `api/src/room.ts` `signExternal`, grant `{ path: [path], rate }` instead of
`[path]`, with `rate` around 10 Mbps (room for OBS at 1080p60), and assert the
cap in `api/test/room.test.ts`. Validate against cdn.moq.dev, not only the dev
relay: mint, then publish with the `moq.sh` CLI.

The relay paces only QUIC sessions to a cap and refuses a capped grant over
WebSocket, which OBS and the CLI don't use. Consider capping participants' join
tokens the same way once this works, since the cap protects nothing while a
fresh guest can still publish uncapped.

## Waiting

- moq-dev/moq: cdn.moq.dev runs a relay that accepts capped grants. Released
  relays (through moq-relay 0.17.18) read `publish` only as a list and refuse
  the `{ path, rate }` form; the capped form shipped unreleased
  in [moq-dev/moq@b51eb8cdec](https://github.com/moq-dev/moq/commit/b51eb8cdec).
  Check that a moq-relay release after 0.17.18 lists bitrate caps in its
  changelog and is deployed to cdn.moq.dev.
