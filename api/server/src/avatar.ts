import { eq } from "drizzle-orm";
import { z } from "zod/mini";
import * as Account from "./account";
import * as rpc from "./rpc";

export { randomAvatar as random } from "./client";

export const typeSchema = z.enum(["url", "r2"]);
export type Type = z.infer<typeof typeSchema>;

export function url(env: Env, type: string, key: string): string {
	if (type === "url") {
		return key;
	} else if (type === "r2") {
		if (env.R2_PUBLIC_URL) {
			return `${env.R2_PUBLIC_URL}/avatar/${key}`;
		} else {
			return `${env.API_URL}/avatar/${key}`;
		}
	} else {
		throw new Error("Invalid avatar type");
	}
}

export const router = rpc
	.router()
	.put(
		"/",
		rpc.withForm(
			z.object({
				file: z.instanceof(File),
			}),
		),
		rpc.withAccount,
		async (c) => {
			const ctx = c.var.ctx;
			const file = c.req.valid("form").file;

			// Validate file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				return c.json({ error: "File size too large. Maximum 5MB allowed." }, 400);
			}

			// Get file extension from filename or content type
			let extension: string | undefined;
			if (file.name) {
				const lastDot = file.name.lastIndexOf(".");
				if (lastDot !== -1) {
					extension = file.name.substring(lastDot + 1).toLowerCase();
				}
			} else if (file.type) {
				// Map MIME types to extensions
				const mimeToExt: Record<string, string> = {
					"image/jpeg": "jpg",
					"image/jpg": "jpg",
					"image/png": "png",
					"image/gif": "gif",
					"image/webp": "webp",
					"image/svg+xml": "svg",
				};
				extension = mimeToExt[file.type];
			}

			if (!extension) {
				return c.json({ error: "Unknown file extension" }, 400);
			}

			// Convert file to buffer
			const fileBuffer = new Uint8Array(await file.arrayBuffer());

			// Get current user's avatar info
			const old = (
				await ctx.db
					.select({ avatar: Account.table.avatar, avatarType: Account.table.avatarType })
					.from(Account.table)
					.where(eq(Account.table.id, c.var.account_id))
					.limit(1)
			).at(0);

			if (!old) {
				return c.json({ error: "User not found" }, 404);
			}

			// Upload new avatar
			const id = await ctx.storage.upload("avatar", fileBuffer, extension);

			// Update user's avatar in database
			await ctx.db
				.update(Account.table)
				.set({ avatar: id, avatarType: "r2" })
				.where(eq(Account.table.id, c.var.account_id));

			// Delete old avatar if it's an uploaded file
			if (old.avatarType === "r2") {
				await ctx.storage.delete("avatar", old.avatar);
			}

			// Build full URL
			const avatarUrl = url(ctx.env, "r2", id);

			return c.json({ url: avatarUrl });
		},
	)
	.get(
		"/:key",
		rpc.withParam(
			z.object({
				key: z.string(),
			}),
		),
		async (c) => {
			const ctx = c.var.ctx;
			const key = c.req.valid("param").key;

			// Get the avatar file from storage
			const file = await ctx.storage.get("avatar", key);
			if (!file) {
				return c.json({ error: "Avatar not found" }, 404);
			}

			// Determine content type based on file extension
			const extension = key.split(".").pop()?.toLowerCase();
			const contentType = extension
				? {
						jpg: "image/jpeg",
						jpeg: "image/jpeg",
						png: "image/png",
						gif: "image/gif",
						webp: "image/webp",
						svg: "image/svg+xml",
					}[extension] || "image/png"
				: "image/png";

			// Return the file with appropriate headers
			return new Response(file, {
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=2592000", // Cache for 1 month
				},
			});
		},
	);
