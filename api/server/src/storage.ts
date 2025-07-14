import { v4 as uuidv4 } from "uuid";

export class Context {
	#bucket: R2Bucket;

	constructor(env: Env) {
		this.#bucket = env.STORAGE;
	}

	async upload(folder: string, file: Uint8Array, extension: string): Promise<string> {
		const key = `${uuidv4()}.${extension}`;
		await this.#bucket.put(`${folder}/${key}`, file);
		return key;
	}

	async get(folder: string, key: string): Promise<ArrayBuffer | null> {
		const object = await this.#bucket.get(`${folder}/${key}`);
		if (!object) {
			return null;
		}
		return await object.arrayBuffer();
	}

	async delete(folder: string, key: string): Promise<void> {
		await this.#bucket.delete(`${folder}/${key}`);
	}

	extension(contentType: string): string {
		const extensions: Record<string, string> = {
			"image/jpeg": "jpg",
			"image/png": "png",
			"image/gif": "gif",
			"image/webp": "webp",
			"image/svg+xml": "svg",
		};

		return extensions[contentType] || "jpg";
	}
}

export function validateAvatar(file: File) {
	const maxSize = 5 * 1024 * 1024; // 5MB
	const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

	if (file.size > maxSize) {
		throw new Error("File size too large. Maximum 5MB allowed.");
	}

	if (!allowedTypes.includes(file.type)) {
		throw new Error("Invalid file type. Only JPEG, PNG, GIF, SVG, and WebP are allowed.");
	}
}
