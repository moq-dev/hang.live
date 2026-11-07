# [S] Scope favorite-room presence and balance the app badge

## Goal

Each favorite shows only its own participants, and the application badge equals
the current total after joins, leaves, count changes, and removal of a favorite.

## Plan

Confirmed in `app/src/home.tsx`: `FavoriteRoom` passes no `path` to
`PreviewRoomCompact`, although `app/src/preview.tsx` accepts it. Multiple favorite
cards therefore watch the same unfiltered announcement set.
Pass each room's prefix using the existing preview API and verify boundary-safe
matching against sibling room names.

The same component returns a cleanup callback from Solid's `createEffect`.
Solid does not register that as teardown: use `onCleanup` inside the effect so
each prior count is decremented before a new one is added and on disposal.
Verify with two favorite rooms, a changing count, and unmount/removal; mock the
announcement input rather than requiring a live relay for every unit test.

Keep these fixes together because they establish one correct presence total.
The maintainer's AFK request authorizes the recommended m0 priority.
