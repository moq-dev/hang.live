import { z } from "zod/mini";
import * as Account from "./account";
import * as Avatar from "./avatar";
import * as Health from "./health";
import * as OAuth from "./oauth";
import * as Room from "./room";
import * as rpc from "./rpc";

export { Account, Avatar, Health, OAuth, Room };

const app = rpc
	.app()
	.route("/auth", OAuth.router)
	.route("/avatar", Avatar.router)
	.route("/account", Account.router)
	.route("/health", Health.router)
	.route("/room", Room.router)
	.get(
		"/public/:folder/:path{.+}",
		rpc.withParam(
			z.object({
				folder: z.string(),
				path: z.string(),
			}),
		),
		async (c) => {
			const { folder, path } = c.req.valid("param");
			console.log("[Public Proxy] Request - folder:", folder, "path:", path);
			
			try {
				const file = await c.var.ctx.storage.get(folder, path);
				if (!file) {
					console.log("[Public Proxy] File not found:", `${folder}/${path}`);
					return c.json({ error: "File not found" }, 404);
				}
				
				// Determine content type based on file extension
				const extension = path.split(".").pop()?.toLowerCase();
				const contentType = extension
					? {
							jpg: "image/jpeg",
							jpeg: "image/jpeg",
							png: "image/png",
							gif: "image/gif",
							webp: "image/webp",
							svg: "image/svg+xml",
						}[extension] || "application/octet-stream"
					: "application/octet-stream";
				
				console.log("[Public Proxy] Serving file:", `${folder}/${path}`, "type:", contentType);
				
				return new Response(file, {
					headers: {
						"Content-Type": contentType,
						"Cache-Control": "public, max-age=2592000",
					},
				});
			} catch (error) {
				console.error("[Public Proxy] Error serving file:", error);
				return c.json({ error: "Internal server error" }, 500);
			}
		},
	);

export type App = typeof app;

export default app satisfies ExportedHandler<Env>;
