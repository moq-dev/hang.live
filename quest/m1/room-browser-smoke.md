# [M] Smoke-test the room page in a real browser

## Goal

`just check` opens a room in headless Chromium against the local relay and
fails if the room page stops rendering: tiles draw through WebGL, the page
recovers from a lost WebGL context, and a browser without WebGL2 still gets a
usable page.

## Plan

The room canvas is Hang's core surface, yet no test loads it: #46's WebGL leak
and context-loss fixes and #26's no-WebGL2 fallback have no automated signal.
`app/test/media.browser.ts` already starts `moq-relay`, Vite, and Playwright's
Chromium with fake media devices; extend that harness rather than adding a
second one.

- Join a room with two pages and wait for each to draw the other's tile.
  Read the result from state the app exposes (as `window.mediaTest` does),
  not from pixel snapshots.
- Lose and restore the context with `WEBGL_lose_context` and check tiles draw
  again with no GL errors in the console.
- Launch with WebGL disabled (`--disable-webgl`) and check the page shows its
  fallback instead of throwing.

Measure what it adds to `just check` and say so in the PR; the media test sets
the budget.

## Related

- [Space gesture tests](/quest/m1/space-gesture-tests.md) - the input half of
  the room canvas
