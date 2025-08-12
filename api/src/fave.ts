import { z } from "zod";
import * as Auth from "./auth";
import * as Room from "./room";
import * as rpc from "./rpc";

export interface Info {
	room: string;
	created_at: number;
}

export const router = rpc
	.router()
	// Add a room to favorites
	.post("/:room/add", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;
		const room = c.req.valid("param").room;

		try {
			await ctx.db.$client
				.prepare("INSERT INTO favorites (account_id, room) VALUES (?, ?)")
				.bind(account_id, room)
				.run();
			return c.json({ success: true });
		} catch (error) {
			// If it's a unique constraint error, that's fine - already favorited
			if (error instanceof Error && error.message.includes("UNIQUE")) {
				return c.json({ success: true });
			}
			throw error;
		}
	})
	// Remove a room from favorites
	.post("/:room/remove", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;
		const room = c.req.valid("param").room;

		await ctx.db.$client
			.prepare("DELETE FROM favorites WHERE account_id = ? AND room = ?")
			.bind(account_id, room)
			.run();
		return c.json({ success: true });
	})
	// Get all favorited rooms
	.get("/all", Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;

		const result = await ctx.db.$client
			.prepare("SELECT room, created_at FROM favorites WHERE account_id = ? ORDER BY created_at DESC")
			.bind(account_id)
			.all<{ room: string; created_at: number }>();

		const favorites: Info[] = result.results.map((row) => ({
			room: row.room,
			created_at: row.created_at,
		}));

		// Generate a token that allows subscribing to all favorited rooms
		const token = await ctx.room.signPreview(favorites.map((f) => f.room));
		return c.json({ favorites, token });
	})
	// Check if a room is favorited
	.get("/:room", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;
		const room = c.req.valid("param").room;

		const result = await ctx.db.$client
			.prepare("SELECT 1 FROM favorites WHERE account_id = ? AND room = ? LIMIT 1")
			.bind(account_id, room)
			.first();

		return c.json({ is_favorite: result !== null });
	});
