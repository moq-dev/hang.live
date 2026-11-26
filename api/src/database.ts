import { drizzle } from "drizzle-orm/d1";

export type Context = ReturnType<typeof drizzle>;

// Queries go through the table builders, so the relational schema is unused.
export function init(env: Env): Context {
	return drizzle(env.DB);
}
