import * as Account from "./account";
import * as Auth from "./auth";
import * as Database from "./database";
import * as OAuth from "./oauth";
import * as Room from "./room";
import * as Storage from "./storage";

export default class Context {
	env: Env;
	auth: Auth.Context;
	db: Database.Context;
	storage: Storage.Context;
	oauth: OAuth.Context;
	account: Account.Context;
	room: Room.Context;

	constructor(env: Env) {
		this.env = env;
		this.auth = new Auth.Context(env);
		this.db = Database.init(env);
		this.storage = new Storage.Context(env);
		this.account = new Account.Context(env, this.db, this.storage);
		this.oauth = new OAuth.Context(env, this.db);
		this.room = new Room.Context(env);
	}
}
