# [M] Harden OAuth, JWT auth, avatar uploads, and chat sanitization

## Goal

Authentication, avatar storage, and Markdown chat cannot be abused to steal
session tokens, take over accounts, execute scripts on the API origin, crash
guest room joins, or leak participant IP addresses.

## Plan

Fix the verified security and auth bugs found in the 2026-11-25 audit across
`api/src/` and `app/src/`:

- **OAuth redirect & token delivery** (`api/src/oauth.ts`, `app/src/api.ts`,
  `app/src/oauth.tsx`): replace prefix checks (`startsWith(APP_URL)` and
  `startsWith("http://localhost:")`) with parsed `URL` origin/host checks so
  domains like `https://hang.live.evil.com` or `http://localhost:80@evil.com`
  are rejected. Stop passing long-lived auth JWTs in URL query strings (use a
  short-lived exchange code or fragment/cookie), generate CSRF nonces with
  `crypto.getRandomValues`, and remove the dead URL cleanup in
  `Client.loginComplete`.
- **Verified email linking & Apple callback** (`api/src/oauth.ts`): require
  verified email claims from Discord, Google, and Apple before linking a new
  provider to an existing account by email. Move `updateAppleUser` after account
  creation, allow optional first/last names, and key the update on the verified
  ID token account rather than the unverified POST body email.
- **Avatar upload & R2 proxy hardening** (`api/src/account.ts`,
  `api/src/avatar.ts`, `api/src/storage.ts`): enforce `validateAvatar` in
  `account.update` using an allowlist of safe raster types/extensions (or serve
  SVG only with `Content-Security-Policy: sandbox` and
  `X-Content-Type-Options: nosniff`), reject unsafe URL schemes (`javascript:`,
  `data:`) on URL avatars, and restrict `/public` to explicit public prefixes
  rather than proxying arbitrary R2 keys.
- **Graceful JWT failure handling** (`api/src/auth.ts`, `app/src/api.ts`): catch
  `JWT.jwtVerify` failures in `Auth.Context.verify` so expired or malformed
  tokens return `undefined` (401 on `Auth.required`, guest fallback on
  `Auth.optional` instead of 500). Clear stale client auth state when
  `account.info` returns 401.
- **Chat Markdown sanitization** (`app/src/room/chat.ts`,
  `app/src/room/chat-worker.ts`): forbid external `<img>` tags in peer chat
  messages so peers cannot harvest IP addresses, and enforce safe link schemes
  plus `target="_blank" rel="noopener noreferrer"` post-sanitization.

Cover each attack vector and failure path with automated API and app unit tests.
