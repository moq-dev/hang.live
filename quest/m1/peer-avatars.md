# [S] Stop peer avatar URLs from revealing participant IP addresses

## Goal

Joining a room never makes a participant's browser fetch from a host another
participant chose, so a peer cannot harvest IP addresses through their avatar.

## Plan

`app/src/room/video.ts` loads `broadcast.source.user.avatar` straight into an
`Image`, and that URL comes from the peer's own broadcast metadata, so any peer
can point it at a tracking server. The API now only accepts bundled defaults or
uploads for account avatars, but a peer controls its broadcast directly.

- Load a peer avatar only when its origin is the app's own (bundled
  `/avatar/N.svg`) or the R2 public bucket; otherwise fall back to a bundled
  default. Expose the bucket origin to the app at build time.
- Provider avatars (Discord and Google CDNs) are the remaining external origins.
  Decided 2026-11-25 (maintainer, /quest-run): copy provider avatars into R2 at
  signup (rejected: allowlist provider CDNs), so only the two first-party origins
  remain and the allowlist stays closed. Allowlisting `cdn.discordapp.com` and
  `*.googleusercontent.com` would still leak IPs to those providers and break
  when they change hosts.
- Cover the origin check with a unit test.

## Related

- [WebGL fixes](/quest/m1/webgl-physics.md) - also edits avatar loading in `app/src/room/video.ts`
