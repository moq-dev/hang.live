import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";
import { z } from "zod";

// Browser-safe schemas and helpers shared by the API and the app.

// The OAuth providers a user can sign in with.
export const oauthProviders = ["google", "discord", "apple"] as const;

// One of the app's bundled default avatars.
export function randomAvatar(): string {
	const index = Math.floor(Math.random() * 50) + 1;
	return `/avatar/${index}.svg`;
}

// A random two-word display name, such as "Brave Otter".
export function randomName(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: " ",
		style: "capital",
	});
}

// A PKCE-style (RFC 7636) verifier: 32 random bytes, base64url without padding.
const base64urlSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Expected 32 base64url bytes");

// The query that starts an OAuth login.
export const oauthStateSchema = z.object({
	// SHA-256 of a verifier only the client holds; the login code is redeemable only with that verifier.
	// This also stops login CSRF, since a code minted for an attacker's login fails the victim's verifier.
	challenge: base64urlSchema,

	// The client should redirect to this URL after login.
	// This was the page they were on before they clicked the login button.
	redirect: z.string(),
});

// The body that redeems a login code for a session token.
export const oauthTokenSchema = z.object({
	code: z.string(),
	verifier: base64urlSchema,
});

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

// Generate a fresh secret verifier for one login attempt.
export function oauthVerifier(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

// The public challenge sent through the OAuth provider for a verifier.
export async function oauthChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

// A parsed OAuth login query.
export type OauthState = z.infer<typeof oauthStateSchema>;

// Room name validation - only allows URL-safe characters
// Alphanumeric, hyphens, underscores, and dots
const ROOM_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
// The message shown for a room name `isValidRoom` rejects.
export const ROOM_NAME_ERROR = "Hang names can only contain letters, numbers, hyphens, underscores, and periods.";

// Whether a room name holds only URL-safe characters.
export const isValidRoom = (name: string): boolean => {
	return ROOM_NAME_REGEX.test(name);
};

// The image types an avatar upload may be; the API identifies them by their bytes.
export const avatarTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

// Parses an account ID, branded so an unchecked string cannot pass as one.
export const accountIdSchema = z.string().brand("AccountId");
// An account ID that passed `accountIdSchema`.
export type AccountId = z.infer<typeof accountIdSchema>;

// One literal path segment beneath guest/, never a wildcard permission.
export const guestSchema = z.string().regex(/^guest\/[^/*]+$/, "Invalid guest identity");

// The credential the API issues a guest, a compact JWT, which the browser keeps to rejoin as the same guest.
export const guestTokenSchema = z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, "Invalid guest credential");

// Display names, trimmed so whitespace cannot pad a short name past the minimum.
export const nameSchema = z.string().trim().check(z.minLength(4), z.maxLength(100));
