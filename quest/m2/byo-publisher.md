# [M] Bring your own publisher and egress

## Goal

Anyone in a Hang room can mint a scoped MoQ publish token to stream directly
into the room from OBS Studio, `moq-studio`, `moq import capture`, or RTSP, and
copy ready-to-run `moq export` commands to restream or record the room.

## Plan

Showcase that a Hang room is just a standard MoQ path prefix
(`{room}/{identity}/camera.hang`):

- Add an API endpoint (scoped via `@moq/room` `claims()`, plus an expiry and
  a `@moq/auth` publish grant's `rate` cap; the flat `publish_rate` claim is
  refused) that mints a short-lived publish URL/JWT for an external
  guest identity in the current room, plus a read-only subscribe token for
  egress.
- Add a clean "Stream from OBS / CLI" dialog in the room header/menu showing:
  - Copyable relay URL + path for the MoQ OBS plugin and `moq-studio`.
  - Ready-to-paste `moq import capture` and `moq import rtsp` commands.
  - Ready-to-paste `moq export hls` / `rtmp` / `mp4` commands for recording or
    restreaming a participant's broadcast.
- Ensure external publishers that publish standard `.hang` video/audio tracks
  without Hang's `hang/location.json` or `@moq/room`'s `user.json` render cleanly
  as spatial tiles with sensible defaults (fallback name from broadcast path and
  draggable/resizable locally).
- Cover token scoping (cannot publish under another participant's identity) and
  metadata-less external broadcast rendering in tests.

## Related

- [Room token identity](/quest/m1/room-token-identity.md) - binds guest
  identities to API-issued credentials; mint external publisher identities the
  same way
