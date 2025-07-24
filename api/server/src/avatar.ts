import { eq } from "drizzle-orm";
import { z } from "zod/mini";
import * as Account from "./account";
import * as Auth from "./auth";
import * as rpc from "./rpc";

export { randomAvatar as random } from "./client";

export const typeSchema = z.enum(["url", "r2"]);
export type Type = z.infer<typeof typeSchema>;

export function url(env: Env, type: string, key: string): string {
	if (type === "url") {
		return key;
	} else if (type === "r2") {
		return `${env.R2_PUBLIC_URL}/avatar/${key}`;
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
		Auth.required,
		async (c) => {
			const ctx = c.var.ctx;
			const file = c.req.valid("form").file;

			console.log("[Avatar Upload] Starting upload for user:", c.var.account_id);
			console.log("[Avatar Upload] File info:", {
				name: file.name,
				size: file.size,
				type: file.type,
			});

			// Validate file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				console.log("[Avatar Upload] File too large:", file.size);
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
				console.log("[Avatar Upload] Failed to determine extension for file:", file.name, file.type);
				return c.json({ error: "Unknown file extension" }, 400);
			}

			console.log("[Avatar Upload] Determined extension:", extension);

			// Convert file to buffer
			console.log("[Avatar Upload] Converting file to buffer");
			const fileBuffer = new Uint8Array(await file.arrayBuffer());
			console.log("[Avatar Upload] Buffer size:", fileBuffer.length);

			// Get current user's avatar info
			console.log("[Avatar Upload] Fetching current avatar info for user:", c.var.account_id);
			const old = (
				await ctx.db
					.select({ avatar: Account.table.avatar, avatarType: Account.table.avatarType })
					.from(Account.table)
					.where(eq(Account.table.id, c.var.account_id))
					.limit(1)
			).at(0);

			if (!old) {
				console.log("[Avatar Upload] User not found:", c.var.account_id);
				return c.json({ error: "User not found" }, 404);
			}

			console.log("[Avatar Upload] Current avatar info:", old);

			// Upload new avatar
			console.log("[Avatar Upload] Uploading to R2 storage...");
			let id: string;
			try {
				id = await ctx.storage.upload("avatar", fileBuffer, extension);
				console.log("[Avatar Upload] Upload successful, generated key:", id);
			} catch (error) {
				console.error("[Avatar Upload] R2 upload failed:", error);
				return c.json({ error: "Upload failed" }, 500);
			}

			// Update user's avatar in database
			console.log("[Avatar Upload] Updating database with new avatar info");
			try {
				await ctx.db
					.update(Account.table)
					.set({ avatar: id, avatarType: "r2" })
					.where(eq(Account.table.id, c.var.account_id));
				console.log("[Avatar Upload] Database update successful");
			} catch (error) {
				console.error("[Avatar Upload] Database update failed:", error);
				// Clean up uploaded file
				await ctx.storage.delete("avatar", id);
				return c.json({ error: "Database update failed" }, 500);
			}

			// Delete old avatar if it's an uploaded file
			if (old.avatarType === "r2") {
				console.log("[Avatar Upload] Deleting old avatar:", old.avatar);
				try {
					await ctx.storage.delete("avatar", old.avatar);
					console.log("[Avatar Upload] Old avatar deleted successfully");
				} catch (error) {
					console.warn("[Avatar Upload] Failed to delete old avatar:", error);
				}
			}

			// Build full URL
			const avatarUrl = url(ctx.env, "r2", id);
			console.log("[Avatar Upload] Generated avatar URL:", avatarUrl);
			console.log("[Avatar Upload] Upload process completed successfully");

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

			console.log("[Avatar Get] Retrieving avatar:", key);

			// Get the avatar file from storage
			const file = await ctx.storage.get("avatar", key);
			if (!file) {
				console.log("[Avatar Get] Avatar not found:", key);
				return c.json({ error: "Avatar not found" }, 404);
			}

			console.log("[Avatar Get] Avatar retrieved successfully:", key, "size:", file.byteLength);

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
