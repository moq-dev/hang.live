import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";
import { z } from "zod";

// TODO Make a schema module instead of these rag-tag miscellaneous schemas.

// This could be an RPC endpoint in the future.
export const oauthProviders = ["google", "discord", "apple"] as const;

// This could be an RPC endpoint in the future.
export function randomAvatar(): string {
	const index = Math.floor(Math.random() * 50) + 1;
	return `/avatar/${index}.svg`;
}

export function randomName(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: " ",
		style: "capital",
	});
}

export const oauthStateSchema = z.object({
	// A random string to prevent CSRF attacks.
	// The client should validate that they generated this string themselves.
	random: z.string(),

	// The client should redirect to this URL after login.
	// This was the page they were on before they clicked the login button.
	redirect: z.string(),
});

export type OauthState = z.infer<typeof oauthStateSchema>;

// Room name validation - only allows URL-safe characters
// Alphanumeric, hyphens, underscores, and dots
export const ROOM_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
export const ROOM_NAME_ERROR = "Hang names can only contain letters, numbers, hyphens, underscores, and periods.";

export const isValidRoom = (name: string): boolean => {
	return ROOM_NAME_REGEX.test(name);
};

export const accountIdSchema = z.string().brand("AccountId");
export type AccountId = z.infer<typeof accountIdSchema>;

export const AccountInfoSchema = z.object({
	id: accountIdSchema,
	name: z.string().check(z.minLength(4), z.maxLength(100)),
	avatar: z.string(),
});

export type AccountInfo = z.infer<typeof AccountInfoSchema>;
