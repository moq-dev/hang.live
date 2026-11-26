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

## Waiting

- Maintainer: deploy the build that added `relay` to the join response
  (`just deploy`), since the Cloudflare credentials it needs are the
  maintainer's. Check that `curl -s -X POST -H 'Content-Type: application/json'
  -d '{}' https://api.hang.live/room/x/join` returns a `relay` field, then wait
  a day for open tabs to reload.
