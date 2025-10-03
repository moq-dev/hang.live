import { and, eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as Uuid from "uuid";
import { z } from "zod";
import * as Auth from "./auth";
import * as Avatar from "./avatar";
import { AccountId, accountIdSchema } from "./client";
import * as Database from "./database";
import * as OAuth from "./oauth";
import * as rpc from "./rpc";
import * as Storage from "./storage";

export type Id = AccountId;
export const idSchema = accountIdSchema;

// Account schemas
export const infoSchema = z.object({
	id: accountIdSchema,
	name: z.string().check(z.minLength(4), z.maxLength(100)),
	avatar: z.string(),
});

export type Info = z.infer<typeof infoSchema>;

export const createSchema = z.object({
	name: z.string().check(z.minLength(4), z.maxLength(100)),
	email: z.string().check(z.email()),
	avatar: z.optional(z.string()),
});

export type Create = z.infer<typeof createSchema>;

export const table = sqliteTable("accounts", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	avatar: text("avatar").notNull(),
	avatarType: text("avatar_type").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

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
		rpc.withForm(
			z.object({
				name: z.optional(z.string().check(z.minLength(4), z.maxLength(100))),
				avatar: z.optional(z.union([z.string(), z.instanceof(File)])),
			}),
		),
		Auth.required,
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
			.innerJoin(OAuth.table, eq(table.id, OAuth.table.accountId))
			.where(and(eq(OAuth.table.providerId, provider), eq(OAuth.table.providerUser, providerUser)))
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

		const user: NewRow = {
			...info,
			id,
			avatarType: info.avatar ? "url" : "r2",
			avatar: info.avatar ?? Avatar.random(),
			createdAt: now,
			updatedAt: now,
		};

		const row = await this.db.insert(table).values(user).returning();
		const res = this.#rowToInfo(row.at(0));
		if (!res) {
			throw new Error("failed to insert");
		}
		return res;
	}

	async update(id: Id, update: { name?: string; avatar?: File | string }): Promise<Info> {
		let avatar: string | undefined;
		let avatarType: "url" | "r2" | undefined;

		if (update.avatar) {
			const old = (
				await this.db
					.select({ avatar: table.avatar, avatarType: table.avatarType })
					.from(table)
					.where(eq(table.id, id))
					.limit(1)
			).at(0);

			// Only delete old R2 files if we're changing to a different avatar
			if (old?.avatarType === "r2" && old.avatar) {
				await this.storage.delete("avatar", old.avatar);
			}

			// TODO move to avatar.ts
			if (update.avatar instanceof File) {
				// Validate file (reuse avatar validation logic)
				if (update.avatar.size > 5 * 1024 * 1024) {
					throw new Error("File size too large. Maximum 5MB allowed.");
				}

				// Get file extension
				let extension: string | undefined;
				if (update.avatar.name) {
					const lastDot = update.avatar.name.lastIndexOf(".");
					if (lastDot !== -1) {
						extension = update.avatar.name.substring(lastDot + 1).toLowerCase();
					}
				} else if (update.avatar.type) {
					const mimeToExt: Record<string, string> = {
						"image/jpeg": "jpg",
						"image/jpg": "jpg",
						"image/png": "png",
						"image/gif": "gif",
						"image/webp": "webp",
						"image/svg+xml": "svg",
					};
					extension = mimeToExt[update.avatar.type];
				}

				if (!extension) {
					throw new Error("Unknown file extension");
				}

				// Upload to R2
				const fileBuffer = new Uint8Array(await update.avatar.arrayBuffer());

				avatar = await this.storage.upload("avatar", fileBuffer, extension);
				avatarType = "r2";
			} else {
				avatar = update.avatar;
				avatarType = "url";
			}
		}

		const updated = await this.db
			.update(table)
			.set({
				name: update.name,
				avatar,
				avatarType,
			})
			.where(eq(table.id, id))
			.returning();

		const res = this.#rowToInfo(updated.at(0));
		if (!res) {
			// TODO Delete from storage if we failed to upload
			throw new Error("failed to update");
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

		// Delete R2 avatar if it exists
		if (account?.avatarType === "r2" && account.avatar) {
			await this.storage.delete("avatar", account.avatar);
		}

		// Delete OAuth entries
		await this.db.delete(OAuth.table).where(eq(OAuth.table.accountId, id));

		// Delete account
		await this.db.delete(table).where(eq(table.id, id));
	}
}
