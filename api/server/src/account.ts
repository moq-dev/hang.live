import { and, eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as Uuid from "uuid";
import { z } from "zod/mini";
import * as Auth from "./auth";
import * as Avatar from "./avatar";
import * as Database from "./database";
import * as OAuth from "./oauth";
import * as rpc from "./rpc";
import * as Storage from "./storage";

export const idSchema = Auth.accountIdSchema;
export type Id = Auth.AccountId;

// Account schemas
export const infoSchema = z.object({
	// Defined in jwt to avoid circular dependency
	id: idSchema,
	name: z.string(),
	email: z.string().check(z.email()),
	avatar: z.string(),
});

export const createSchema = z.object({
	name: z.string().check(z.minLength(4), z.maxLength(100)),
	email: z.string().check(z.email()),
	avatar: z.optional(z.string()),
});

export const updateSchema = z.object({
	name: z.optional(z.string().check(z.minLength(4), z.maxLength(100))),
	avatar: z.optional(z.string()),
});

export type Info = z.infer<typeof infoSchema>;
export type Create = z.infer<typeof createSchema>;
export type Update = z.infer<typeof updateSchema>;

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
	.put("/info", rpc.withJson(updateSchema), Auth.required, async (c) => {
		const update = c.req.valid("json");
		const info = await c.var.ctx.account.update(c.var.account_id, update);
		return c.json(info, 200);
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

	async update(id: Id, update: Update): Promise<Info> {
		// TODO Move this to the avatar file
		if (update.avatar) {
			console.log("[Account Update] Updating avatar for user:", id);
			console.log("[Account Update] New avatar value:", update.avatar);
			
			const old = (
				await this.db
					.select({ avatar: table.avatar, avatarType: table.avatarType })
					.from(table)
					.where(eq(table.id, id))
					.limit(1)
			).at(0);
			
			console.log("[Account Update] Old avatar info:", old);
			
			if (old?.avatarType === "r2") {
				console.log("[Account Update] Deleting old R2 avatar:", old.avatar);
				await this.storage.delete("avatar", old.avatar);
			}
		}

		const updated = await this.db
			.update(table)
			.set({
				name: update.name,
				avatar: update.avatar,
				avatarType: update.avatar ? "url" : undefined,
			})
			.where(eq(table.id, id))
			.returning();
			
		console.log("[Account Update] Database update completed with values:", {
			name: update.name,
			avatar: update.avatar,
			avatarType: update.avatar ? "url" : undefined,
		});

		const res = this.#rowToInfo(updated.at(0));
		if (!res) {
			throw new Error("failed to update");
		}
		return res;
	}
}
