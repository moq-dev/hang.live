# [M] Document app and API exports, and gate it

## Goal

Every export in `app/src` and `api/src` carries a one-line comment saying what it is, and `just check` fails on a new export without one.

## Plan

The m1 docs audit (base `6a3af10`) counted 173 of 232 exports without a doc comment, most in `app/src/room/meme.ts`, `api/src/oauth.ts`, `app/src/room/metadata.ts`, `api/src/account.ts`, and `api/src/client.ts`.
Neither TypeScript nor Biome has a missing-docs rule, and `moq/` enforces none for JS either.

- Gate with a small Bun script run by `just check` that walks `app/src` and `api/src` (skipping tests and `.d.ts`) and fails on an `export` declaration not directly preceded by a `//` or `/** */` comment. Recommended over `eslint-plugin-jsdoc`, which would add a second linter toolchain for one rule.
- Write each comment the way you'd say it out loud; skip restating the name.
- Land after the open m1 code audit, which edits the same files, to avoid churn.

## Related

- [m2 docs audit](/quest/m2/audit-docs.md) - rechecks the count if this has not landed
