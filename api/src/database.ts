import { drizzle } from "drizzle-orm/d1";

// The D1 database, queried through Drizzle.
export type Context = ReturnType<typeof drizzle>;

// Opens D1 through Drizzle without a relational schema, since queries go through the table builders.
export function init(env: Env): Context {
	return drizzle(env.DB);
}
