# [M] Finish staging and ship the first release

## Goal

Staging at `new.hang.live` passes its whole post-deploy check, sign-in included, and the first release from `release` deploys production at `hang.live` through the Deploy workflow, so no quest waits on a manual `just deploy` anymore.

## Plan

Built by [#84](https://github.com/moq-dev/hang.live/pull/84): the `staging` Wrangler environments (`api-hang-staging` on `api.new.hang.live` with D1 `db-hang-staging` and R2 `public-hang-staging` on `public.new.hang.live`, `hang-staging` on `new.hang.live`), `just deploy <env>` and `just verify <env>`, the `Deploy` and `Release gate` workflows, the `staging` and `live` GitHub environments, the `release` branch with its ruleset, and the hourly smoke checking out `release`.
Staging's `RELAY_SECRET` is an EdDSA key (kid `343c51e9d4c0672b`) whose JWK carries the scope `root: staging`, publish and subscribe everything beneath it, so even a relay that trusted it for more would refuse a `hang/` token; its only copy is the Worker secret, so rotating it means generating a new one (`moq auth generate --algorithm EdDSA --root staging --publish "" --subscribe ""`) and having moq.pro trust the new public key.

Staging sign-in reuses the old `hang.now` apps, repointed at `new.hang.live`: Google client `1093943946174-915g0a9jpu7gih5emghmtabhge29qgg2` (in Testing, with the maintainer as a test user), Discord `1392629623812259940`, and Apple services ID `now.hang.api` with key `KMX7K7944B` (team `D7D5SDDB5Z`). Their secrets live in bws as `hang-staging-google-client-secret`, `hang-staging-discord-client-secret`, and `hang-staging-apple-key` (the base64 `.p8` body), set on `api-hang-staging` with `wrangler secret put --env staging`. Google, Discord, and Apple each sign in end to end on `new.hang.live`.
The old `hang.now` Cloudflare resources are deleted, and the `hang.now` domain no longer resolves.

Remaining, in order:
- Once moq.pro trusts the staging key, rerun the latest `Deploy` run on `main`; its `just smoke` must pass, which is what the release gate needs.
- Cut the first release (a PR from `main` into `release`, merged with a merge commit), and watch its `Deploy` run go green on `hang.live`.
- Automate cutting a release: a `just release` recipe that opens the PR merging `release` into `main` when `main` lacks it, then the release PR, so no person runs the two-PR sequence `CONTRIBUTING.md` describes.

## Waiting

- moq.pro: trust Hang's staging relay public key for the `staging` root only, and nothing under `hang`. The key is `{"alg":"EdDSA","key_ops":["verify"],"kty":"OKP","crv":"Ed25519","x":"_sG71kOdh2PjtCrOlKth1HSTLkkqUOf6D7TYMbC8Gsk","kid":"343c51e9d4c0672b","scope":{"root":"staging","publish":["**"],"subscribe":["**"]}}`; the staging API already signs with its private half. Check: two tabs joining a `new.hang.live` room see each other (`just smoke https://new.hang.live` passes).

## Related

- [Audit build and CI cost](/quest/m2/audit-cost.md) - weighs the deploy jobs' minutes on its next run
