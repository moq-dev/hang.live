import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export { randomAvatar as random } from "./client";

export const typeSchema = z.enum(["url", "r2"]);
export type Type = z.infer<typeof typeSchema>;

// Largest accepted upload.
export const MAX_SIZE = 5 * 1024 * 1024;

// Raster formats only: an SVG can carry script, and the bytes decide the type, never the client's label.
const FORMATS = [
	{ extension: "png", contentType: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
	{ extension: "jpg", contentType: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
	{
		extension: "gif",
		contentType: "image/gif",
		magic: [
			[0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
			[0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
		],
	},
	// RIFF....WEBP, with the size bytes in between unchecked.
	{
		extension: "webp",
		contentType: "image/webp",
		magic: [[0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50]],
	},
] as const;

export type Extension = (typeof FORMATS)[number]["extension"];

// The content type served for a stored avatar's extension, or undefined if it is not a safe raster type.
export function contentType(extension: string): string | undefined {
	return FORMATS.find((format) => format.extension === extension)?.contentType;
}

// A validated upload, ready to store.
export interface Upload {
	data: Uint8Array;
	extension: Extension;
	contentType: string;
}

// Check an uploaded avatar's size and identify its format from its leading bytes.
export async function validate(file: File): Promise<Upload> {
	if (file.size > MAX_SIZE) {
		throw new HTTPException(413, { message: "Avatar too large. Maximum 5MB allowed." });
	}

	const data = new Uint8Array(await file.arrayBuffer());
	const format = FORMATS.find((format) =>
		format.magic.some((magic) => magic.every((byte, i) => byte === -1 || data[i] === byte)),
	);
	if (!format) {
		throw new HTTPException(415, { message: "Invalid avatar. Only PNG, JPEG, GIF, and WebP images are allowed." });
	}

	return { data, extension: format.extension, contentType: format.contentType };
}

// Fetch a provider's avatar, such as a Discord or Google CDN image, so it can be copied into R2.
// The bytes come from a third party, so they get the same size cap and format check as an upload.
export async function download(url: string): Promise<Upload> {
	if (new URL(url).protocol !== "https:") throw new Error(`refusing non-https avatar ${url}`);

	// A stalled CDN must not hang the login that asked for it.
	const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
	if (!res.ok || !res.body) throw new Error(`avatar fetch failed: ${res.status} ${url}`);

	// Stream with a running total: Content-Length is optional and could lie.
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_SIZE) {
			await reader.cancel();
			throw new Error(`avatar larger than ${MAX_SIZE} bytes: ${url}`);
		}
		chunks.push(value);
	}

	return await validate(new File(chunks, "avatar"));
}

// Whether a string avatar names one of the app's bundled defaults, the only URL clients may set.
export function isDefault(avatar: string): boolean {
	return /^\/avatar\/\d+\.svg$/.test(avatar);
}

export function url(env: { R2_PUBLIC_URL: string }, type: string, key: string): string {
	if (type === "url") {
		return key;
	} else if (type === "r2") {
		return `${env.R2_PUBLIC_URL}/avatar/${key}`;
	} else {
		throw new Error("Invalid avatar type");
	}
}
