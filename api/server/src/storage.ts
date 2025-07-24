import { v4 as uuidv4 } from "uuid";

export class Context {
	#bucket: R2Bucket;

	constructor(env: Env) {
		this.#bucket = env.PUBLIC;
		console.log("[Storage] Initialized R2 storage with PUBLIC bucket binding");
		console.log("[Storage] R2_PUBLIC_URL:", env.R2_PUBLIC_URL);
		console.log("[Storage] R2 bucket object type:", typeof this.#bucket);
		console.log("[Storage] R2 bucket available:", !!this.#bucket);
	}

	async upload(folder: string, file: Uint8Array, extension: string): Promise<string> {
		const key = `${uuidv4()}.${extension}`;
		const fullPath = `${folder}/${key}`;
		console.log("[Storage] Uploading to R2:", {
			fullPath,
			bucketBinding: "PUBLIC",
			fileSize: file.length,
		});
		
		try {
			await this.#bucket.put(fullPath, file);
			console.log("[Storage] R2 upload successful:", fullPath);
			return key;
		} catch (error) {
			console.error("[Storage] R2 upload error:", error);
			throw error;
		}
	}

	async get(folder: string, key: string): Promise<ArrayBuffer | null> {
		const fullPath = `${folder}/${key}`;
		console.log("[Storage] Getting from R2:", fullPath);
		
		try {
			const object = await this.#bucket.get(fullPath);
			if (!object) {
				console.log("[Storage] Object not found in R2:", fullPath);
				return null;
			}
			console.log("[Storage] R2 get successful:", fullPath);
			return await object.arrayBuffer();
		} catch (error) {
			console.error("[Storage] R2 get error:", error);
			throw error;
		}
	}

	async delete(folder: string, key: string): Promise<void> {
		const fullPath = `${folder}/${key}`;
		console.log("[Storage] Deleting from R2:", fullPath);
		
		try {
			await this.#bucket.delete(fullPath);
			console.log("[Storage] R2 delete successful:", fullPath);
		} catch (error) {
			console.error("[Storage] R2 delete error:", error);
			throw error;
		}
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
