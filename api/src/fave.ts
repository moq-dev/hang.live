import { and, desc, eq, sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import * as Auth from "./auth";
import * as Room from "./room";
import * as rpc from "./rpc";

export interface Info {
	room: string;
	created_at: number;
}

// One row per favorited room, created by migrations/0003_favorites.sql.
export const table = sqliteTable(
	"favorites",
	{
		accountId: text("account_id").notNull(),
		room: text("room").notNull(),
		// Unix seconds, kept numeric because the API returns it as-is.
		createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
	},
	(t) => [primaryKey({ columns: [t.accountId, t.room] })],
);

export const router = rpc
	.router()
	// Add a room to favorites
	.post("/:room/add", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const room = c.req.valid("param").room;

		// Favoriting twice is a no-op.
		await c.var.ctx.db.insert(table).values({ accountId: c.var.account_id, room }).onConflictDoNothing();
		return c.json({ success: true });
	})
	// Remove a room from favorites
	.post("/:room/remove", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const room = c.req.valid("param").room;

		await c.var.ctx.db.delete(table).where(and(eq(table.accountId, c.var.account_id), eq(table.room, room)));
		return c.json({ success: true });
	})
	// Get all favorited rooms
	.get("/all", Auth.required, async (c) => {
		const ctx = c.var.ctx;

		const favorites: Info[] = await ctx.db
			.select({ room: table.room, created_at: table.createdAt })
			.from(table)
			.where(eq(table.accountId, c.var.account_id))
			.orderBy(desc(table.createdAt));

		// A grant to watch every favorited room, renewed by fetching the list again.
		const preview = await ctx.room.signPreview(favorites.map((f) => f.room));
		return c.json({ favorites, preview, url: preview && Room.legacyUrl(preview) });
	})
	// Check if a room is favorited
	.get("/:room", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const room = c.req.valid("param").room;

		const result = await c.var.ctx.db
			.select({ room: table.room })
			.from(table)
			.where(and(eq(table.accountId, c.var.account_id), eq(table.room, room)))
			.limit(1);

		return c.json({ is_favorite: result.length > 0 });
	});
