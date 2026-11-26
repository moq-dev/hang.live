# [XS] Try and promote streaming from OBS and the CLI

## Goal

Streaming into a hang from OBS and recording it with `moq export` are tried on
hang.live and announced.

## Plan

In a hang on hang.live, open the antenna button beside Settings ("Stream from
OBS or the CLI"). Paste its relay URL and broadcast into OBS's MoQ dock and Go
Live; the stream should join as its own tile, labelled `external/<id>`, that you
can drag and zoom. Then run the "Record to MP4" command against another tile and
play the file.

If OBS or the CLI cannot connect at all, cdn.moq.dev likely runs a relay that
predates capped grants (moq-relay 0.17.2 or older), which refuses the publish
token's `rate`: upgrade the relay rather than drop the cap.

## Waiting

- Maintainer (PC): stream from OBS into hang.live as the Plan describes, then
  announce it. An agent can't: it has no OBS install or camera, and only
  validated against the local dev relay with an `ffmpeg` test pattern.
