import { Root, Signal } from "@kixelated/signals";
import { z } from "zod/v4-mini";
import { AccountInfo, AccountUpdate } from ".";
import { Client } from "./client";
import { EmptySchema, schema } from "./schema";

const AccountInfoSchema = schema<AccountInfo>()({
	id: z.string(),
	name: z.string(),
	avatar: z.string(),
});

const AccountUpdateSchema = schema<AccountUpdate>()({
	name: z.optional(z.string().check(z.minLength(4), z.maxLength(100))),
});

export class Account {
	#client: Client;

	info: Signal<AccountInfo | undefined>;
	error = new Signal<string | undefined>(undefined);

	#signals = new Root();

	constructor(client: Client) {
		this.#client = client;

		// Use local storage to cache the info
		let info: AccountInfo | undefined;
		try {
			const cached = localStorage.getItem("account.info");
			info = cached ? AccountInfoSchema.parse(JSON.parse(cached)) : undefined;
		} catch (e: unknown) {
			this.error.set(`Failed to use cached account info: ${e}`);
		}

		this.info = new Signal(info);

		this.#signals.effect((effect) => {
			const info = effect.get(this.info);
			if (info) {
				localStorage.setItem("account.info", JSON.stringify(info));
			} else {
				localStorage.removeItem("account.info");
			}
		});

		this.#signals.effect((effect) => {
			const authenticated = effect.unique(this.#client.authenticated);
			if (!authenticated) return;

			// Once authenticated, fetch the account info
			this.#client.get("/account/info", AccountInfoSchema).then((info) => {
				this.info.set(info);
				this.error.set(undefined);
			}).catch((e) => {
				this.error.set(`Failed to fetch account info: ${e}`);
			});
		});
	}

	async update(update: AccountUpdate): Promise<void> {
		await this.#client.post("/account/update", update, AccountUpdateSchema, EmptySchema);
	}

	close() {
		this.#signals.close();
	}
}

const DEFAULTS = 50;

export function getDefaultAvatar() {
	const index = Math.floor(Math.random() * DEFAULTS);
	return `/avatars/${index}.svg`;
}
