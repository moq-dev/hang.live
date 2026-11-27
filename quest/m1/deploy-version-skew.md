# [S] Load the app across a deploy's version skew

## Goal

A browser that opens `hang.live` or `new.hang.live` while an app deploy propagates, or that keeps a page open across one, loads and runs the app instead of a blank page.
Today Cloudflare serves the old and new app Worker versions side by side for seconds after `wrangler deploy` (measured up to 22 s from one location in [#89](https://github.com/moq-dev/hang.live/pull/89)), and each version only has its own hashed `assets/`.
The app Worker is assets-only with `not_found_handling: single-page-application`, so a version missing a bundle answers it with `200` and `index.html`, and the module script fails to load.
Both directions break: new HTML from a new machine asking an old one for the new bundle, and an open page (or a lazy chunk) asking a new machine for the previous build's bundle.

## Plan

Recommendations (agent, while the maintainer was away), following Cloudflare's [version skew](https://developers.cloudflare.com/workers/versions-and-deployments/version-skew/) guidance:

- Keep the previous release's assets in each deploy, which fixes old HTML reaching a new machine. Build with Vite's `build.manifest` so each deploy publishes the list of files it serves; before `wrangler deploy`, `just ship` fetches the live site's manifest and every file it names from the edge into `app/dist/assets/` (content-hashed names never collide), failing loud if any is missing. That keeps exactly one previous release, needs no storage outside Cloudflare, and works the same for `just deploy` by hand and the Deploy workflow. Rejected: a GitHub Actions artifact per environment, since `live` can go longer than artifact retention between releases.
- Version affinity and version overrides do not fit: both need a request header on every asset request, which a browser's `<script type="module">` and chunk imports cannot send, and an override is ignored where the deployment has not arrived yet.
- New HTML reaching an old machine has no fix from keeping assets, since the old version cannot know the new files. The open decision below covers it.
- Verify on staging the way #89 measured skew: deploy two probe builds back to back while polling, and check a page from the first build keeps loading its chunks and a fresh load never fails. Keep `just verify`'s byte checks working with the extra files.

## Waiting

- Maintainer: during a deploy's propagation, a new page can ask a machine still on the old Worker version for its new bundle, get `index.html` back, and fail to load; how should the app recover, given the rule against working around failures with a retry?
  - Reload once on a load failure (Recommended) - an inline handler on the entry script's `error` and Vite's `vite:preloadError` reloads the page once, guarded by `sessionStorage` so a truly broken deploy shows its error instead of looping; deterministic, covers stale open tabs too, and the root cause (no propagation signal from Cloudflare) is outside Hang's control
  - Two-phase deploy - deploy the old HTML with both releases' assets, wait, then deploy the new HTML, as Cloudflare suggests; avoids any reload, but the wait between phases is a guess Cloudflare itself says proves nothing, and it doubles every deploy
  - Add a Worker script - put a `main` in front of the assets so a missing `/assets/*` returns `404` instead of the page; makes the failure honest but still needs one of the above to recover, and adds code to an assets-only Worker

## Related

- [Finish staging and ship the first release](/quest/m1/deploy-staging-and-release.md) - built the deploy path this changes
