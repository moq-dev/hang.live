import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import * as Avatar from "./avatar";
import * as rpc from "./rpc";

export class Context {
	#bucket: R2Bucket;

	constructor(env: Pick<Env, "PUBLIC">) {
		this.#bucket = env.PUBLIC;
	}

	async upload(folder: string, file: Avatar.Upload): Promise<string> {
		const key = `${uuidv4()}.${file.extension}`;
		const fullPath = `${folder}/${key}`;

		// Store the content type so the public bucket serves the image as an image, never sniffed.
		await this.#bucket.put(fullPath, file.data, { httpMetadata: { contentType: file.contentType } });
		return key;
	}

	async get(folder: string, key: string): Promise<ArrayBuffer | null> {
		const fullPath = `${folder}/${key}`;

		const object = await this.#bucket.get(fullPath);
		if (!object) {
			return null;
		}
		return await object.arrayBuffer();
	}

	async delete(folder: string, key: string): Promise<void> {
		const fullPath = `${folder}/${key}`;
		await this.#bucket.delete(fullPath);
	}
}

// Serves uploaded avatars where no public bucket domain fronts R2, such as local development.
// Only keys `upload` could have written, so no other bucket object leaks through the API origin.
export const router = rpc.router().get(
	"/avatar/:key",
	rpc.withParam(
		z.object({
			key: z.string().regex(/^[0-9a-f-]{36}\.[a-z]+$/),
		}),
	),
	async (c) => {
		const { key } = c.req.valid("param");

		const contentType = Avatar.contentType(key.slice(key.indexOf(".") + 1));
		if (!contentType) {
			return c.json({ error: "File not found" }, 404);
		}

		const file = await c.var.ctx.storage.get("avatar", key);
		if (!file) {
			return c.json({ error: "File not found" }, 404);
		}

		return new Response(file, {
			headers: {
				"Content-Type": contentType,
				"Content-Security-Policy": "default-src 'none'; sandbox",
				"X-Content-Type-Options": "nosniff",
				"Cache-Control": "public, max-age=2592000",
			},
		});
	},
);
