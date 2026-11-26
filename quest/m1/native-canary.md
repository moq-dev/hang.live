# [S] Stabilize Tauri native app as a mobile library canary

## Goal

The Tauri native wrapper works reliably as a lightweight canary for testing
MoQ's Android, iOS, and native libraries without broken OAuth deep links,
dropped startup hooks, or disruptive mid-call restarts.

## Plan

Decided 2026-11-25 (maintainer): focus Hang's consumer polish on the web app +
Cloudflare API, and keep `native/` scoped as a canary for exercising MoQ's
mobile/native libraries rather than a flagship desktop product.

- **Merge duplicate `.setup()` hooks** (`native/src/lib.rs`): on Linux and
  Windows debug builds, the second `t.setup(...)` call for deep-link
  registration currently overwrites the desktop updater `t.setup(...)`. Combine
  setup into a single `.setup()` closure and handle update-check errors without
  panicking the background task.
- **Fix OAuth deep link parsing** (`app/src/tauri/deep_link.ts`): `new
  URL("hang://oauth/home?...")` puts `oauth` in `hostname` and `/home` in
  `pathname`, dropping `/oauth` from the redirect. Reconstruct and validate a
  safe internal path (rejecting protocol-relative `//` redirects).
- **Avoid forced mid-call relaunches** (`app/src/tauri/update.ts`,
  `native/src/update.rs`): avoid auto-restarting the app while the user is
  actively joined to a room, and ensure JS and Rust update loops do not race
  each other.
- **Clarify scope** (`README.md`, `app/src/download.tsx`): document `native/` as
  a mobile/native MoQ test canary so contributors do not over-invest in consumer
  installer/download polish.
