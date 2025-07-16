// Some functions and constants also exported to the client.

import { z } from "zod/mini";

// This could be an RPC endpoint in the future.
export const oauthProviders = ["google", "discord"] as const;

// This could be an RPC endpoint in the future.
export function randomAvatar(): string {
	const index = Math.floor(Math.random() * 50) + 1;
	return `/avatar/${index}.svg`;
}

export const oauthStateSchema = z.object({
	// A random string to prevent CSRF attacks.
	// The client should validate that they generated this string themselves.
	random: z.string(),

	// The client should redirect to this URL after login.
	// This was the page they were on before they clicked the login button.
	redirectUrl: z.optional(z.string()),
});

export type OauthState = z.infer<typeof oauthStateSchema>;
