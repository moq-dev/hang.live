import { drizzle } from "drizzle-orm/d1";
import * as Account from "./account";
import * as OAuth from "./oauth";

export type Context = ReturnType<typeof drizzle>;

export function init(env: Env): Context {
	return drizzle(env.DB, { schema: { ...OAuth.table, ...Account.table } });
}

export default Context;
