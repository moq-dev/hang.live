import * as Tauri from "../tauri";

let lock = false;
// A closed owner's pending writes must finish before the next owner's writes.
let pending = Promise.resolve();

async function set(count: number): Promise<void> {
	if (Tauri.Api) {
		const success = await Tauri.Api.window
			.getCurrentWindow()
			.setBadgeCount(count || undefined)
			.then(() => true)
			.catch(() => false);
		if (success) return;
	}

	if (count ? navigator.setAppBadge : navigator.clearAppBadge) {
		const success = await (count ? navigator.setAppBadge(count) : navigator.clearAppBadge())
			.then(() => true)
			.catch(() => false);
		if (success) return;
	}
}

/**
 * A utility class for managing app badge counts across Tauri and web environments.
 *
 * The badge appears on the app icon in the dock (macOS), taskbar (Windows),
 * or home screen (mobile) depending on the platform.
 *
 * Automatically detects and uses:
 * - Tauri API: window.setBadgeCount() / window.clearBadge()
 * - Web API: navigator.setAppBadge() / navigator.clearAppBadge()
 */
export class Badge {
	private current: number = 0;

	#closed = false;

	constructor() {
		if (lock) throw new Error("Badge is already locked");

		// Only allow one instance of Badge to be created at a time.
		// Otherwise they will fight for control of the badge.
		lock = true;
	}

	/**
	 * Set the badge count. Pass 0 to clear the badge.
	 *
	 * @param count - The number to display on the badge, or 0 to clear
	 */
	set(count: number): void {
		if (this.#closed) throw new Error("closed");
		this.current = count;
		pending = pending.then(() => set(count));
	}

	/**
	 * Get the current badge count
	 */
	get(): number {
		return this.current;
	}

	increment(v = 1): void {
		if (this.current + v < 0) throw new Error("Badge count cannot be negative");
		this.set(this.current + v);
	}

	decrement(v = 1): void {
		this.increment(-v);
	}

	close() {
		if (this.#closed) return;
		this.set(0);
		this.#closed = true;
		lock = false;
	}
}
