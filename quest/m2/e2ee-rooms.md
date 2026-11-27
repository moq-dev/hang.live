# [M] End-to-end encrypted private rooms

## Goal

Participants can create or join a private room whose media, spatial positions,
chat, and track names are end-to-end encrypted client-side under a key held
only in the URL `#fragment`, so `api/` and the relay see only opaque names and
ciphertext.

## Plan

Hang builds no cryptography. It consumes [`@moq/e2ee`](/moq/js/e2ee/README.md),
which implements the
[`moq-e2ee-01-wip` profile](/moq/drafts/draft-lcurley-moq-e2ee.md), from the
pinned `moq/` submodule, along with the encrypted publish, watch, and room
wiring upstream ships. Missing pieces go to `moq-dev/moq`, not here. Sender
signing is out of scope (maintainer, 2026-11-26): the profile leaves it out,
and no `moq-sign` profile exists.

### Upstream state

Checked 2026-11-25 against pinned `moq/` (`28d8eb84d6`) and `moq-dev/moq` main
(`901714058b`):

- `moq/js/e2ee` (`@moq/e2ee`) exists. The `moq/js/crypto` package, `E2ee`/`Sign`
  classes, and profiles `moq-e2ee-00`/`moq-sign-00` that this quest first named
  do not. It implements profile `moq-e2ee-01-wip`, is `private`, and its README
  says the format is still changing.
- Upstream marked E2EE "not ready yet" on 2026-11-16. The finished format is
  `quest/m3/e2ee-format.md`, and the browser wiring (`quest/m5/e2ee/browser.md`,
  needing `consumer.md` and `net-wrap/js.md`) sits in m5. `@moq/publish` and
  `@moq/watch` don't take a credential yet.
- `@moq/room` has no encrypted mode, and no upstream quest owns one. Its roster
  reads identity and kind from announced path segments
  (`moq/js/room/src/path.ts`), but `Credential.path(semantic)` is one-way, so a
  subscriber can't parse an opaque path back into a participant.
- No JS signing package exists, and the upstream epic makes sender
  authenticity against another credential holder an explicit non-goal.
- Only `moq-lite-07-wip`, which `@moq/net`'s default versions leave out,
  carries the publisher's instance end to end; older Lite versions resolve
  their own, so subscribers could not derive keys. The pinned relay leaves it
  out by default too.

### Hang work once upstream lands

- Add `moq/js/e2ee` to the root `package.json` workspaces.
- Show a "Private (E2EE)" toggle when starting a room. It generates the
  `Credential` (a 32-byte `crypto.getRandomValues` secret) and puts it only in
  the URL `#fragment`. Keep it in memory only: no `localStorage`, settings,
  analytics, logs, or HTML attributes (the same rule `browser.md` sets for the
  components). Pass it to the components through their programmatic API.
- Keep the room name and credential away from `api/` and the relay. The client
  generates a random opaque room ID alongside the credential; the join route
  ([`room.ts`](/api/src/room.ts)) and the relay grant's root take that ID, the
  page URL path names only it, and participant-scoped publishing stays as it
  is, so `api/` never signs a grant under the plaintext name. The display name
  travels inside an encrypted track. Private rooms use their own URL route, so
  a link missing its fragment is recognisable and shows a "missing key" warning
  instead of an empty room. Verify that the join request and relay grant carry
  no plaintext room name and no credential bytes.
- Keep the fragment out of OAuth. `loginStart` (`app/src/api.ts`) sends
  `window.location.href`, fragment included, to `api/` and then to the
  provider in `state`. Strip the fragment there. A guest who signs in from a
  private room reopens the invite afterwards.
- Hide favorites in private rooms. A favorite saves only the opaque ID and
  reopens through the public `/@<id>` route, which skips the missing-key
  warning and could publish plaintext under the same relay room.
- Connect private rooms only with Lite versions that preserve the publisher's
  instance (`moq-lite-07-wip`), and refuse a session that negotiates any other.
  Every relay hop must accept that version alongside the defaults public rooms
  use: enable it in `dev/root.toml` and confirm `cdn.moq.dev` accepts it.
- Publish each participant broadcast through the finished upstream wrapper,
  not today's draft API (`credential.produce()` and its separate `Epoch` change
  with `moq-e2ee-01`, which binds the broadcast name and uses the moq-net
  `Instance`). Every publish, re-publish, and page load takes a fresh producing
  instance from the wrapper, announced as the route's instance rather than in
  the path, and Hang never caches or persists one, so no epoch repeats under
  one credential across runs or restarts. A unit test pins that a republish
  under one credential announces a new instance and stays decryptable for
  subscribers.
- The `location`, chat, and metadata tracks (`app/src/room/metadata.ts`) are
  tracks on that broadcast, so the wrapper encrypts their names and payloads
  with no Hang-side crypto. So is the `hang/live.json` datagram track for live
  cursors and drags, which the profile covers with its own datagram key domain.
- Discover private-room participants through upstream's encrypted roster in
  both views: the lobby preview (`PreviewRoom` in `app/src/preview.tsx`) and the 3D
  room's own announce loop (`app/src/room/index.ts`), which today parses
  plaintext path segments and would drop every opaque path, leaving the joined
  room empty. The 3D room uses upstream's discovery-only API, which yields
  participants and their kind without opening a `Watch.Player`, and keeps its
  existing watch pipeline per tile, so no peer is watched twice.
- Turn off the stats track and `echo` while a credential is set, which
  `browser.md` requires.
- Add a lock indicator to the room header.
- Test by capturing every relay-visible announce path, track name, payload
  byte, and datagram from an in-memory origin. Assert that none contains the
  room name, participant names, `camera`/`screen`/`location`/`chat`, chat text,
  location JSON, cursor positions, or known media frame bytes. Time comes from
  a `@moq/clock` manual clock (`app/src/room/**` bans raw time functions), and
  no test sleeps.
- The participant identity segment in announce paths (`account_id`, or the
  guest id from [#53](https://github.com/moq-dev/hang.live/pull/53)) stays
  relay-visible. The relay already learns it from the token it verifies. A
  private room accepts that and hides only names and content.

## Waiting

- moq-dev/moq: encrypted browser publish and watch. Check: `quest/m3/e2ee-format.md` and `quest/m5/e2ee/browser.md` are gone from moq main, `moq/js/e2ee/package.json` is no longer `private`, and `grep -rn Credential moq/js/publish/src moq/js/watch/src` finds a credential property. Then bump the pin.
- moq-dev/moq: an encrypted `@moq/room` roster that finds participants and their kind without parsing plaintext path segments, for example an opaque per-participant path plus a kind and identity carried in an encrypted track, with a discovery-only API that yields participants and their kind without opening a `Watch.Player`, for the 3D room's own per-tile watchers. No upstream quest owns this yet. Advance it with `/quest-plan` in moq-dev/moq. Check: `grep -rn e2ee moq/js/room/src` finds the mode, and the pinned `moq/js/room` exposes encrypted discovery that creates no `Watch.Player`.
