// The account tables, apart from the routes, since each references the other.

import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One row per account, unique by email address.
export const accounts = sqliteTable("accounts", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	avatar: text("avatar").notNull(),
	avatarType: text("avatar_type").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// The OAuth sign-ins linked to each account, at most one per provider.
export const linked = sqliteTable(
	"accounts_linked",
	{
		accountId: text("account_id")
			.notNull()
			.references(() => accounts.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		providerUser: text("provider_user").notNull(),
		emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.providerId] })],
);
