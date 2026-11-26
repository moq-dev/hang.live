# [XS] Update the privacy policy for current third parties

## Goal

`app/src/privacy.tsx` names every third party that handles user data, so the published policy matches what the app does.

## Plan

The m1 docs audit (base `6a3af10`) checked the policy claim by claim.
Accurate: sign-in providers (Google, Discord, Apple), stored account fields (email, name, avatar), local session storage, account deletion from settings.
Not mentioned:

- Media, chat messages, names, and avatars travel through `moq.pro` relays (`cdn.moq.dev`) since `infra/` was retired, while "Data Sharing" says nothing is shared.
- High-quality text-to-speech downloads the Kokoro model from Hugging Face (`app/src/room/tts/kokoro.ts`), which sees the browser's IP.
- The app and API run on Cloudflare Workers, with accounts in D1 and avatars in R2.

Bump "Last Updated" with the change.

## Waiting

- Maintainer: write the policy text for the items above; it is legal copy the maintainer writes, so an agent only lists what to cover. Done when `privacy.tsx` covers them or the maintainer decides it need not.
