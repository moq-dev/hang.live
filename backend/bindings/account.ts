import { Root } from "@kixelated/signals";
import { z } from "zod/v4-mini";
import { AccountAvatar, AccountInfo, AccountUpdate } from ".";
import { Client } from "./client";
import { schema } from "./schema";

const AccountInfoSchema = schema<AccountInfo>()({
	id: z.string(),
	name: z.string(),
	avatar: z.url(),
});

const AccountUpdateSchema = schema<AccountUpdate>()({
	name: z.optional(z.string().check(z.minLength(4), z.maxLength(100))),
	avatar: z.optional(z.string()),
});

// Schema for avatar upload response
const AccountAvatarSchema = schema<AccountAvatar>()({
	url: z.url(),
});

export class Account {
	#client: Client;

	#signals = new Root();

	constructor(client: Client) {
		this.#client = client;
	}

	async info(): Promise<AccountInfo> {
		return await this.#client.get("/account/info", AccountInfoSchema);
	}

	async update(update: AccountUpdate): Promise<AccountInfo> {
		return await this.#client.post("/account/info", update, AccountUpdateSchema, AccountInfoSchema);
	}

	async uploadAvatar(file: File): Promise<string> {
		const formData = new FormData();
		formData.append("avatar", file);

		const response = await this.#client.fetch("/account/avatar", {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		const result = AccountAvatarSchema.safeParse(data);
		if (!result.success) {
			throw new Error(`Invalid API response: ${result.error.message}`);
		}

		return result.data.url;
	}

	close() {
		this.#signals.close();
	}
}

const DEFAULTS = 50;

export function randomAvatar() {
	const index = Math.floor(Math.random() * DEFAULTS);
	return `/avatar/${index}.svg`;
}
