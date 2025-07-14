import * as Account from "./account";
import * as Database from "./database";
import * as JWT from "./jwt";
import * as OAuth from "./oauth";
import * as Storage from "./storage";

export default class Context {
	env: Env;
	jwt: JWT.Context;
	db: Database.Context;
	storage: Storage.Context;
	oauth: OAuth.Context;
	account: Account.Context;

	constructor(env: Env) {
		this.env = env;
		this.jwt = new JWT.Context(env);
		this.db = Database.init(env);
		this.storage = new Storage.Context(env);
		this.account = new Account.Context(env, this.db, this.storage);
		this.oauth = new OAuth.Context(env, this.db);
	}
}
