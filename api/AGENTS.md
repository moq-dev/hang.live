The Hono API on Cloudflare Workers (`@hang/api`): accounts, OAuth, avatars in R2, favorites in D1, and relay tokens.

- Each module (`account.ts`, `oauth.ts`, `room.ts`, ...) owns its routes and its `Context`; `context.ts` builds them per request. Drizzle tables live beside their routes, except the account tables in `tables.ts`, which reference each other.
- `client.ts` is the browser-safe entry the app imports at runtime; keep Worker-only imports out of it.
- A schema change is a new SQL file under `migrations/`, applied by `just api dev` and `just api deploy`. Keep it additive: the previous app build keeps calling the API during a deploy.
- Room tokens are signed with `@moq/auth` and expire; the app renews them through the join and favorites routes. `RELAY_PREFIX` scopes every token; a participant publishes only under its own identity, which a guest proves with the credential the API signed it.
- Test with `bun run --cwd api test`; `test/harness.ts` runs routes against in-memory SQLite and R2 fakes.
