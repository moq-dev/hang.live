# [M] Finish staging and ship the first release

## Goal

Staging at `new.hang.live` passes its whole post-deploy check, sign-in included, and the first release from `release` deploys production at `hang.live` through the Deploy workflow, so no quest waits on a manual `just deploy` anymore.

## Plan

Built by [#84](https://github.com/moq-dev/hang.live/pull/84): the `staging` Wrangler environments (`api-hang-staging` on `api.new.hang.live` with D1 `db-hang-staging` and R2 `public-hang-staging` on `public.new.hang.live`, `hang-staging` on `new.hang.live`), `just deploy <env>` and `just verify <env>`, the `Deploy` and `Release gate` workflows, the `staging` and `live` GitHub environments, the `release` branch with its ruleset, and the hourly smoke checking out `release`.
Staging's `RELAY_SECRET` is an EdDSA key (kid `343c51e9d4c0672b`) whose JWK carries the scope `root: staging`, publish and subscribe everything beneath it, so even a relay that trusted it for more would refuse a `hang/` token; its only copy is the Worker secret, so rotating it means generating a new one (`moq auth generate --algorithm EdDSA --root staging --publish "" --subscribe ""`) and having moq.pro trust the new public key.

Remaining, in order:
- Once moq.pro trusts the staging key, rerun the latest `Deploy` run on `main`; its `just smoke` must pass, which is what the release gate needs.
- Point the old `hang.now` Google, Discord, and Apple (`now.hang.api`) sign-in apps' redirect URIs at `https://api.new.hang.live` by driving the maintainer's signed-in browser, then `bun wrangler secret put GOOGLE_CLIENT_SECRET|DISCORD_CLIENT_SECRET|APPLE_CLIENT_SECRET --env staging` from bws. Their client IDs are already in `api/wrangler.jsonc`. Check: signing in with each on `new.hang.live` lands back signed in.
- Cut the first release (a PR from `main` into `release`, merged with a merge commit), and watch its `Deploy` run go green on `hang.live`.
- After that first green production deploy, drop the "deploy `main`" step from quests that wait on a manual deploy, such as [MoQ demos](/quest/m1/moq-dev-demos.md).
- The old `hang.now` resources still exist on Cloudflare: Workers `api-hang-now` and `hang-now`, D1 `db-hang-now`, and R2 `public-hang-now`. Delete them once the maintainer agrees.

## Waiting

- moq.pro: trust Hang's staging relay public key for the `staging` root only, and nothing under `hang`. The key is `{"alg":"EdDSA","key_ops":["verify"],"kty":"OKP","crv":"Ed25519","x":"_sG71kOdh2PjtCrOlKth1HSTLkkqUOf6D7TYMbC8Gsk","kid":"343c51e9d4c0672b","scope":{"root":"staging","publish":["**"],"subscribe":["**"]}}`; the staging API already signs with its private half. Check: two tabs joining a `new.hang.live` room see each other (`just smoke https://new.hang.live` passes).
- Maintainer (action): store the secrets of the old `hang.now` Google, Discord, and Apple (`now.hang.api`) sign-in apps, Apple's private key included, in bws under names for Hang staging, so staging sign-in can be configured. An agent cannot: this host's bws machine account is read-only, and bws holds none of them yet. Check: `bws secret list | jq -r '.[].key'` lists them.
- Maintainer: delete the old `hang.now` Cloudflare resources (Workers `api-hang-now` and `hang-now`, D1 `db-hang-now`, R2 `public-hang-now`), which staging on `new.hang.live` replaced?
  - Delete them (Recommended) - nothing serves `hang.now` anymore, and its data predates the current schema
  - Keep them - only if the old D1 or R2 holds something worth exporting first

## Related

- [Audit build and CI cost](/quest/m2/audit-cost.md) - weighs the deploy jobs' minutes on its next run
