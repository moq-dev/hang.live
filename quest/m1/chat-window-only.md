# [XS] Drop the legacy chat message field

## Goal

Chat messages travel only on `@moq/room`'s `chat` window; `hang/chat.json`
carries typing alone.

## Plan

[room-media](https://github.com/moq-dev/hang.live/pull/43) moved messages to the
window, advertised as `hang.messages` in the catalog. It still writes `message`
on `hang/chat.json`, and still reads that field from a broadcast whose catalog
lacks `hang.messages`, so tabs opened before that deploy keep chatting with new
ones.

Once that deploy has been live for a day (an open tab older than that is
unlikely), stop writing `message` in `serveExtras` (`app/src/room/metadata.ts`),
drop the legacy read in `consumeExtras` along with `ChatValue.message`, and
update `metadata.test.ts`.

## Scheduled

- 2026-11-27 - one full day after `fc0dc04`, which includes
  [room-media](https://github.com/moq-dev/hang.live/pull/43), was deployed to
  `hang.live` on 2026-11-25
