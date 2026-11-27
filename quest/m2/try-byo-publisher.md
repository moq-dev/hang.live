# [XS] Try and promote streaming from OBS and the CLI

## Goal

Streaming into a hang from OBS and recording it with `moq export` are tried on
hang.live and announced.

## Plan

In a hang on hang.live, open the antenna button beside Settings ("Stream from
OBS or the CLI"). Paste its relay URL and broadcast into OBS's MoQ dock and Go
Live; the stream should join as its own tile, labelled `external/<id>`, that you
can drag and zoom. Then run the "Record to MP4" command against another tile
with the CLI from `moq.sh` and play the file.

## Waiting

- Maintainer (PC): stream from OBS into hang.live as the Plan describes, then
  announce it. An agent can't: it has no OBS install or camera, and validated
  only against the local dev relay with an `ffmpeg` test pattern. The feature
  reaches production with the first hang.live deploy after it landed (the
  2026-11-27 deploy, from main `4f30924`, predates it); check that the antenna
  button shows beside Settings in a hang on hang.live.
