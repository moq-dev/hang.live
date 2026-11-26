import * as Clock from "@moq/clock";

/**
 * Yield each grant `sign` returns until `signal` aborts, asking for the next once a tenth of the
 * latest one's `lifetime` seconds remains; a grant without one ends the renewals. Renewing late
 * matters to a session that can present a new token only when it redials (moq-lite before 07),
 * which then lasts as long as the token it dialed with. A failed renewal is retried at half of
 * what remains while the token still works; the first sign failing, or a renewal failing once
 * the token expired, throws.
 */
export async function* renew<T extends { lifetime?: number }>(
	sign: () => Promise<T>,
	signal: AbortSignal,
): AsyncGenerator<T, void, undefined> {
	let expires = Clock.Instant.ZERO;
	let margin = Clock.Duration.ZERO;
	for (;;) {
		try {
			const grant = await sign();
			if (signal.aborted) return;
			if (grant.lifetime !== undefined) {
				const lifetime = Clock.Duration.secs(grant.lifetime);
				expires = Clock.now().saturatingAdd(lifetime);
				margin = lifetime.div(10);
			}
			yield grant;
			if (grant.lifetime === undefined) return;
		} catch (err) {
			if (signal.aborted) return;
			if (!Clock.now().lt(expires)) throw err;
			console.warn("failed to renew the relay token, retrying", err);
		}

		const remaining = expires.since(Clock.now());
		const early = remaining.saturatingSub(margin);
		// Never sooner than a second, so a token about to expire is not asked for in a burst.
		const wait = early.isZero() ? remaining.div(2).max(Clock.Duration.secs(1)) : early;
		try {
			await Clock.sleep(wait, { signal });
		} catch {
			return;
		}
	}
}
