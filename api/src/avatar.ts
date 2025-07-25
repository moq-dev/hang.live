import { z } from "zod";
import * as rpc from "./rpc";

export { randomAvatar as random } from "./shared";

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

export const router = rpc.router().get(
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
