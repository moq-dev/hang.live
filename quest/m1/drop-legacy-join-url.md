# [XS] Drop the pre-renewal join fields

## Goal

The join and favorites routes stop serving fields that only browser tabs
opened before room token renewal read.

## Plan

Room token renewal shipped expand-first, so tabs loaded from the earlier build
kept joining while the deploy rolled out:

- `POST /room/:room/join` and `GET /fave/all` still return `url`, the relay
  URL with the token in its `jwt` query (`Room.legacyUrl` in `api/src/room.ts`).
- The join route accepts a bare `guest/<id>` path and joins it as a new guest
  (the `guestSchema.transform` in its JSON schema).
- The app falls back to `url` when a response has no `relay` or `preview`
  (`app/src/sup.tsx` and `app/src/home.tsx`), so a rollback of the API alone
  keeps rooms joinable.

Delete all three and their tests in `api/test/room.test.ts` and
`api/test/account.test.ts`. A tab from the earlier build that is still open
then fails to join until it is reloaded. Its token expires within `LIFETIME`
(two hours) anyway, and it has no renewal.

The build that added `relay` reached production on 2026-11-27 (`just deploy`
from `4f30924`): `POST https://api.hang.live/room/x/join` returns `relay`,
`token`, and `lifetime`, and a guest joined a room in a browser.

## Scheduled

- 2026-11-28 - one full day after `4f30924`, whose join response carries
  `relay`, was deployed to `hang.live` on 2026-11-27, so open tabs from the
  earlier build have reloaded
