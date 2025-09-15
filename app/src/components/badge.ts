let lock = false;

import Tauri from "../tauri/api";

async function set(count: number | undefined) {
	if (Tauri) {
		await Tauri.window
			.getCurrentWindow()
			.setBadgeCount(count || undefined)
			.catch((error) => console.warn("Failed to set Tauri badge:", error));
	} else if (navigator.setAppBadge) {
		await navigator
			.setAppBadge(count || undefined)
			.catch((error) => console.warn("Failed to set Web badge:", error));
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

	#p?: Promise<void> = Promise.resolve();

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
		this.current = count;
		if (!this.#p) throw new Error("closed");
		this.#p = this.#p.then(() => set(count));
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
		this.current = 0;
		this.#p = undefined;
		lock = false;
	}
}
