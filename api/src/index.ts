import * as Account from "./account";
import * as Avatar from "./avatar";
import * as Fave from "./fave";
import * as Health from "./health";
import * as OAuth from "./oauth";
import * as Room from "./room";
import * as rpc from "./rpc";
import * as Storage from "./storage";

export { Account, Avatar, Fave, Health, OAuth, Room };

const app = rpc
	.app()
	.route("/auth", OAuth.router)
	.route("/avatar", Avatar.router)
	.route("/account", Account.router)
	.route("/fave", Fave.router)
	.route("/health", Health.router)
	.route("/room", Room.router)
	.route("/public", Storage.router);

export type App = typeof app;

export default app satisfies ExportedHandler<Env>;
