import { Root, Signal } from "@kixelated/signals";
import { z } from "zod/v4-mini";
import { AccountInfo, AccountUpdate } from ".";
import { Client } from "./client";
import { EmptySchema, schema } from "./schema";

const AccountInfoSchema = schema<AccountInfo>()({
	id: z.string(),
	name: z.string(),
	avatar: z.optional(z.string()),
});

const AccountUpdateSchema = schema<AccountUpdate>()({
	name: z.optional(z.string().check(z.minLength(4), z.maxLength(100))),
});

export class Account {
	#client: Client;

	info: Signal<AccountInfo | undefined>;

	#signals = new Root();

	constructor(client: Client) {
		this.#client = client;

		// Use local storage to cache the info
		let info: AccountInfo | undefined;
		try {
			const cached = localStorage.getItem("account.info");
			info = cached ? JSON.parse(cached) : undefined;
		} catch (e) {
			console.error("Failed to parse account info from local storage", e);
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
			const authenticated = effect.get(this.#client.authenticated);
			if (!authenticated) return;

			this.#client.get("/account/info", AccountInfoSchema).then((info) => {
				this.info.set(info);
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
	return `${index}.svg`;
}
