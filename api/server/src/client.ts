// Some functions and constants also exported to the client.

// This could be an RPC endpoint in the future.
export const oauthProviders = ["discord", "google"] as const;

// This could be an RPC endpoint in the future.
export function randomAvatar(): string {
	const index = Math.floor(Math.random() * 50) + 1;
	return `/avatar/${index}.svg`;
}
