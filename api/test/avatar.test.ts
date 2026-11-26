import { expect, test } from "bun:test";
import * as Avatar from "../src/avatar";
import { avatarTypes } from "../src/client";
import { harness } from "./harness";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 ");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

test("uploads are typed by their bytes, never by the client's label", async () => {
	for (const [bytes, extension] of [
		[PNG, "png"],
		[JPEG, "jpg"],
		[GIF, "gif"],
		[WEBP, "webp"],
	] as const) {
		// A misleading name and type change nothing.
		const upload = await Avatar.validate(new File([bytes], "evil.svg", { type: "image/svg+xml" }));
		expect(upload.extension).toBe(extension);
		expect(upload.contentType).toBe(`image/${extension === "jpg" ? "jpeg" : extension}`);
	}

	for (const bytes of [SVG, HTML, new Uint8Array(), new TextEncoder().encode("RIFF\x10\x00\x00\x00WAVE")]) {
		await expect(Avatar.validate(new File([bytes], "avatar.png", { type: "image/png" }))).rejects.toMatchObject({
			status: 415,
		});
	}

	// The app's picker offers exactly what the API accepts.
	for (const type of avatarTypes) {
		expect(Avatar.contentType(type === "image/jpeg" ? "jpg" : type.slice("image/".length))).toBe(type);
	}

	const large = new File([PNG, new Uint8Array(Avatar.MAX_SIZE)], "big.png", { type: "image/png" });
	await expect(Avatar.validate(large)).rejects.toMatchObject({ status: 413 });
});

test("clients may only pick the bundled default avatars by URL", () => {
	expect(Avatar.isDefault("/avatar/12.svg")).toBe(true);
	for (const bad of [
		"javascript:alert(1)",
		"data:image/svg+xml,<svg onload=alert(1)>",
		"https://evil.com/pixel.png",
		"//evil.com/avatar/1.svg",
		"/avatar/../account/1.svg",
		"/avatar/1.svg?x",
	]) {
		expect(Avatar.isDefault(bad)).toBe(false);
	}
});

async function setup() {
	const h = harness();
	const account = await h.ctx.account.create({ email: "me@example.com", name: "Me Myself" });
	const token = await h.ctx.auth.create(account.id);
	const put = (avatar: File | string) => {
		const form = new FormData();
		if (avatar instanceof File) form.set("avatar", avatar);
		else form.set("avatar", avatar);
		return h.app.request("/account/info", {
			method: "PUT",
			body: form,
			headers: { Authorization: `Bearer ${token}` },
		});
	};
	return { ...h, account, put };
}

test("rejected avatars are refused without losing the current one", async () => {
	const { put, bucket } = await setup();

	const first = await put(new File([PNG], "me.png", { type: "image/png" }));
	expect(first.status).toBe(200);
	const uploaded = (await first.json()) as { avatar: string };
	expect(uploaded.avatar).toStartWith("https://public.hang.test/avatar/");
	const keys = [...bucket.objects.keys()];
	expect(keys).toHaveLength(1);
	expect(keys[0]).toEndWith(".png");
	// The bucket serves the stored type rather than sniffing.
	expect(bucket.objects.get(keys[0] ?? "")?.contentType).toBe("image/png");

	for (const bad of [
		new File([SVG], "x.svg", { type: "image/svg+xml" }),
		"javascript:alert(1)",
		"https://evil.com/x.png",
	]) {
		const res = await put(bad);
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
	}
	expect([...bucket.objects.keys()]).toEqual(keys);

	// Replacing an upload deletes the old object.
	expect((await put(new File([JPEG], "me.jpg", { type: "image/jpeg" }))).status).toBe(200);
	expect([...bucket.objects.keys()].map((k) => k.split(".").pop())).toEqual(["jpg"]);

	// Switching back to a default deletes the upload too.
	expect((await put("/avatar/3.svg")).status).toBe(200);
	expect(bucket.objects.size).toBe(0);
});

test("oversized forms are refused before buffering", async () => {
	const { put } = await setup();
	const res = await put(new File([PNG, new Uint8Array(Avatar.MAX_SIZE + 128 * 1024)], "big.png"));
	expect(res.status).toBe(413);
});

test("the public proxy serves only uploaded avatars, inertly", async () => {
	const { app, bucket } = await setup();
	const id = "0b6e9a3c-1f2d-4c5b-8a7e-9d0c1b2a3f4e";
	await bucket.put(`avatar/${id}.png`, PNG);
	await bucket.put(`avatar/${id}.svg`, SVG);
	await bucket.put("private/secret.txt", new TextEncoder().encode("secret"));

	const ok = await app.request(`/public/avatar/${id}.png`);
	expect(ok.status).toBe(200);
	expect(ok.headers.get("Content-Type")).toBe("image/png");
	expect(ok.headers.get("X-Content-Type-Options")).toBe("nosniff");
	expect(ok.headers.get("Content-Security-Policy")).toContain("sandbox");

	for (const path of [
		`/public/avatar/${id}.svg`,
		"/public/private/secret.txt",
		"/public/avatar/..%2Fprivate%2Fsecret.txt",
	]) {
		expect([400, 404]).toContain((await app.request(path)).status);
	}
});
