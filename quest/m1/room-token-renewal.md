# [S] Renew room tokens without a redial

## Goal

A participant who stays in a room keeps an unbroken session as their room
token is renewed, so room and preview tokens can expire within minutes.

## Plan

Room and preview tokens expire after `LIFETIME` (two hours) in
`api/src/room.ts`. `app/src/relay.ts` renews each one when a tenth of its
lifetime remains, and the app sets the new token on the `tokens` signal of its
`Moq.Connection`. Only moq-lite 07 presents a renewed token over AUTH on the
live session. The default versions (lite-06 and older) carry the token only
when dialing, so the relay ends the session at expiry ("authorization token
expired"). The connection then redials with the renewed token, and the
participant's announce drops for about 0.6s on a local relay.

Once moq-dev/moq offers either path below by default, on both `@moq/net` and
the relay Hang uses, bump the `moq/` pin and drop `LIFETIME` to about ten
minutes:

- moq-lite 07 with in-band AUTH. Today `moq-lite-07-wip` must be named in
  `versions`, and the pinned relay refuses it.
- A make-before-break redial, like a GOAWAY migration, when `tokens` change on
  a session that cannot take them in band.

Verify with `just dev` and a short `LIFETIME`: the relay log shows no
`lease ended ... why=expired` for a participant while renewals continue.

## Waiting

- moq-dev/moq: `@moq/net` and `moq-relay` renew a live session's token by
  default, through lite-07 AUTH or a make-before-break redial. Check by joining
  a room locally with a 30s `LIFETIME` and watching for expired leases.
