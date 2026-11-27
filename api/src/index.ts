import { Hono } from "hono";
import * as Account from "./account";
import { withContext } from "./context";
import * as Fave from "./fave";
import * as Health from "./health";
import * as OAuth from "./oauth";
import * as Room from "./room";
import * as rpc from "./rpc";
import * as Storage from "./storage";

/** An account's public profile. */
export type { Info as AccountInfo } from "./account";
/** A favorited room. */
export type { Info as FaveInfo } from "./fave";
/** An OAuth provider the API signs in with. */
export type { ProviderId } from "./oauth";

const app = new Hono<{ Bindings: Env }>()
	.use(withContext)
	.use(rpc.withCors)
	.route("/auth", OAuth.router)
	.route("/account", Account.router)
	.route("/fave", Fave.router)
	.route("/health", Health.router)
	.route("/room", Room.router)
	.route("/public", Storage.router);

export type App = typeof app;

export default app satisfies ExportedHandler<Env>;
