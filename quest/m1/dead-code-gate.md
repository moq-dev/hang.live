# [S] Gate unused files and exports with fallow

## Goal

`just check` fails on an unused file, export, or type in `api/` and `app/`, not only on unused dependencies, so dead code stops landing between `code` audits.

## Plan

[moq-dev/hang.live#56](https://github.com/moq-dev/hang.live/pull/56) added fallow 3.44.0 to `just check` as `fallow dead-code --unused-deps`, configured in `.fallowrc.jsonc`. Widen it to the full `fallow dead-code` run, which takes about 0.1 s:

- Add `app/test/media.html` as an entry: `app/test/media.browser.ts` loads it through Vite, so fallow reports `app/test/media.tsx` as unused.
- Turn off `unused-class-members`: it reports every method called through a context object or Comlink proxy (about 40 on 2026-11-25), and grepping names in the `code` audit covers them.
- Keep exports used only inside their own file unexported, which the m1 `code` audit did, so the run starts clean.
- Check the gate on a planted dead export before landing it.
