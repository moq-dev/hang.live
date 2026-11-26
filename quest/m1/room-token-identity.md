# [M] Bind guest identities and expire room tokens

## Goal

A room token lets its holder publish only as an identity the API issued to
them, and stops working once it expires, without interrupting a session that
stays in the room.

## Plan

Found while aligning `api/src/room.ts` with `@moq/auth`:

- `POST /room/:room/join` trusts the client's `guest` field (`guestSchema` only
  checks the `guest/<id>` shape), and every participant sees other guests'
  broadcast paths. Anyone in a room can mint a token that publishes as another
  guest. Issue guests a credential the API can verify on rejoin, such as a
  signed guest token stored in place of the bare path, and refuse an unsigned
  `guest` value.
- Join and preview tokens carry no `expires`, so a leaked relay URL, or one
  minted for a since-deleted account, publishes forever. Sign with an expiry
  and renew in-band through `Moq.Connection`'s `tokens` dials (see
  `moq/js/net/src/connection/pool.ts`), re-calling the join endpoint before
  expiry.
- Cover both in `api/test/room.test.ts`: a forged guest is refused, and a
  token's `exp` is set.
