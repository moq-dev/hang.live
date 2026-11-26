import { and, eq } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import * as Uuid from "uuid";
import { z } from "zod";
import * as Auth from "./auth";
import * as Avatar from "./avatar";
import { type AccountId, accountIdSchema, nameSchema } from "./client";
import type * as Database from "./database";
import type * as OAuth from "./oauth";
import * as rpc from "./rpc";
import type * as Storage from "./storage";
import * as Tables from "./tables";

export type Id = AccountId;
export const idSchema = accountIdSchema;

// Account schemas
export const infoSchema = z.object({
	id: accountIdSchema,
	name: nameSchema,
	avatar: z.string(),
});

export type Info = z.infer<typeof infoSchema>;

export interface Create {
	name: string;
	email: string;
	// A validated image to store in R2; a random bundled default when absent.
	avatar?: Avatar.Upload;
}

const table = Tables.accounts;

export type Row = typeof table.$inferSelect;
export type NewRow = typeof table.$inferInsert;

export const router = rpc
	.router()
	.get("/info", Auth.required, async (c) => {
		const info = await c.var.ctx.account.get(c.var.account_id);
		if (!info) {
			return c.json({ error: "Account not found" }, 404);
		}

		return c.json(info, 200);
	})
	.put(
		"/info",
		Auth.required,
		// Bound the buffered form by the avatar cap plus room for the other fields.
		bodyLimit({ maxSize: Avatar.MAX_SIZE + 64 * 1024 }),
		rpc.withForm(
			z.object({
				name: z.optional(nameSchema),
				avatar: z.optional(z.union([z.string(), z.instanceof(File)])),
			}),
		),
		async (c) => {
			const form = c.req.valid("form");
			const ctx = c.var.ctx;

			const info = await ctx.account.update(c.var.account_id, {
				name: form.name,
				avatar: form.avatar,
			});
			return c.json(info, 200);
		},
	)
	.delete("/info", Auth.required, async (c) => {
		const ctx = c.var.ctx;
		await ctx.account.delete(c.var.account_id);
		return c.json({ success: true }, 200);
	});

export class Context {
	env: Env;
	db: Database.Context;
	storage: Storage.Context;

	constructor(env: Env, db: Database.Context, storage: Storage.Context) {
		this.env = env;
		this.db = db;
		this.storage = storage;
	}

	async get(id: Id): Promise<Info | undefined> {
		const result = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
		return this.#rowToInfo(result.at(0));
	}

	async getByEmail(email: string): Promise<Info | undefined> {
		const result = await this.db.select().from(table).where(eq(table.email, email)).limit(1);
		return this.#rowToInfo(result.at(0));
	}

	async getByProvider(provider: OAuth.ProviderId, providerUser: string): Promise<Info | undefined> {
		const result = await this.db
			.select()
			.from(table)
			.innerJoin(Tables.linked, eq(table.id, Tables.linked.accountId))
			.where(and(eq(Tables.linked.providerId, provider), eq(Tables.linked.providerUser, providerUser)))
			.limit(1);

		return this.#rowToInfo(result.at(0)?.accounts);
	}

	#rowToInfo(row?: Row): Info | undefined {
		if (!row) return;

		return {
			...row,
			id: idSchema.parse(row.id),
			avatar: Avatar.url(this.env, row.avatarType, row.avatar),
		};
	}

	async create(info: Create): Promise<Info> {
		const id = Uuid.v4();
		const now = new Date();

		// The avatar is cosmetic, so an R2 failure leaves a bundled default rather than failing signup.
		const avatar = info.avatar
			? await this.storage.upload("avatar", info.avatar).catch((err) => {
					console.error("failed to store signup avatar", err);
					return undefined;
				})
			: undefined;

		const user: NewRow = {
			name: info.name,
			email: info.email,
			id,
			// Random avatars are app-relative URLs, not R2 keys.
			avatarType: avatar ? "r2" : "url",
			avatar: avatar ?? Avatar.random(),
			createdAt: now,
			updatedAt: now,
		};

		const row = await this.db
			.insert(table)
			.values(user)
			.returning()
			.catch(async (err) => {
				if (avatar) await this.storage.delete("avatar", avatar);
				throw err;
			});
		const res = this.#rowToInfo(row.at(0));
		if (!res) {
			throw new Error("failed to insert");
		}
		return res;
	}

	// The external avatar URL an account still holds from before signup copied provider avatars into R2.
	async externalAvatar(id: Id): Promise<string | undefined> {
		const row = (
			await this.db
				.select({ avatar: table.avatar, avatarType: table.avatarType })
				.from(table)
				.where(eq(table.id, id))
				.limit(1)
		).at(0);
		return row?.avatarType === "url" && !Avatar.isDefault(row.avatar) ? row.avatar : undefined;
	}

	// Swap an external avatar for a stored copy, unless the account picked another avatar meanwhile.
	async replaceExternalAvatar(id: Id, external: string, upload: Avatar.Upload): Promise<void> {
		const key = await this.storage.upload("avatar", upload);
		const updated = await this.db
			.update(table)
			.set({ avatar: key, avatarType: "r2", updatedAt: new Date() })
			.where(and(eq(table.id, id), eq(table.avatarType, "url"), eq(table.avatar, external)))
			.returning({ id: table.id })
			.catch(async (err) => {
				await this.storage.delete("avatar", key);
				throw err;
			});
		if (updated.length === 0) await this.storage.delete("avatar", key);
	}

	async update(id: Id, update: { name?: string; avatar?: File | string }): Promise<Info> {
		let avatar: string | undefined;
		let avatarType: Avatar.Type | undefined;

		// Validate and upload before touching the old avatar, so a rejected upload loses nothing.
		if (update.avatar instanceof File) {
			avatar = await this.storage.upload("avatar", await Avatar.validate(update.avatar));
			avatarType = "r2";
		} else if (update.avatar !== undefined) {
			if (!Avatar.isDefault(update.avatar)) {
				throw new HTTPException(400, { message: "Invalid avatar URL" });
			}
			avatar = update.avatar;
			avatarType = "url";
		}

		const old = avatar
			? (
					await this.db
						.select({ avatar: table.avatar, avatarType: table.avatarType })
						.from(table)
						.where(eq(table.id, id))
						.limit(1)
				).at(0)
			: undefined;

		const updated = await this.db
			.update(table)
			.set({
				name: update.name,
				avatar,
				avatarType,
				updatedAt: new Date(),
			})
			.where(eq(table.id, id))
			.returning()
			.catch(async (err) => {
				// Don't orphan the new upload when the row still points at the old avatar.
				if (avatarType === "r2" && avatar) await this.storage.delete("avatar", avatar);
				throw err;
			});

		const res = this.#rowToInfo(updated.at(0));
		if (!res) {
			if (avatarType === "r2" && avatar) await this.storage.delete("avatar", avatar);
			throw new Error("failed to update");
		}

		// The save already committed, so a failed cleanup must not report it as failed.
		if (old?.avatarType === "r2" && old.avatar !== avatar) {
			await this.storage.delete("avatar", old.avatar).catch((err) => {
				console.error(`failed to delete replaced avatar ${old.avatar}`, err);
			});
		}

		return res;
	}

	async delete(id: Id): Promise<void> {
		// Get avatar info before deleting
		const account = (
			await this.db
				.select({ avatar: table.avatar, avatarType: table.avatarType })
				.from(table)
				.where(eq(table.id, id))
				.limit(1)
		).at(0);

		// Delete the R2 avatar while the row still names it, so a failed delete can be retried.
		// R2 deletes of a missing key succeed, so a retry after a failed row delete also works.
		if (account?.avatarType === "r2" && account.avatar) {
			await this.storage.delete("avatar", account.avatar);
		}

		// Delete OAuth entries
		await this.db.delete(Tables.linked).where(eq(Tables.linked.accountId, id));

		// Delete account
		await this.db.delete(table).where(eq(table.id, id));
	}
}
