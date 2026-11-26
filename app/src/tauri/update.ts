import { Signal } from "@moq/signals";
import * as Process from "@tauri-apps/plugin-process";
import * as Updater from "@tauri-apps/plugin-updater";
import { Local } from "../room/local";

export type Status =
	| {
			type: "available";
			version: string;
	  }
	| {
			type: "downloading";
			version: string;
			size?: number;
			progress: number;
	  }
	| {
			type: "downloaded";
			version: string;
			size: number;
	  }
	| {
			type: "installing";
			version: string;
	  }
	| {
			type: "error";
			error: string;
	  };

const CHECK_INTERVAL = 1000 * 60 * 60 * 24;

// VERY important that this doesn't throw an error
// That's why it's decoupled from the UI and runs in the background.
export class Update {
	status = new Signal<Status | undefined>(undefined);

	#download: Promise<void>;
	download!: () => void;

	#install: Promise<void>;
	install!: () => void;

	constructor() {
		this.#download = new Promise((resolve) => {
			this.download = resolve;
		});

		this.#install = new Promise((resolve) => {
			this.install = resolve;
		});

		void this.#run();
	}

	async #check() {
		try {
			console.log("checking for update");

			const update = await Updater.check({ allowDowngrades: true });
			if (!update) return;

			console.log(`found update ${update.version} from ${update.date} with notes ${update.body}`);

			this.status.set({
				type: "available",
				version: update.version,
			});

			// Auto-download or auto-install the update if it's been 6/12 hours since we found it.
			const downloadTimeout = new Promise<void>((resolve) => setTimeout(resolve, CHECK_INTERVAL / 4));
			const installTimeout = new Promise<void>((resolve) => setTimeout(resolve, CHECK_INTERVAL / 2));

			// Auto-download the update if it's been 6 hours since we found it.
			await Promise.race([this.#download, downloadTimeout]);

			let size: number | undefined;
			let progress = 0;

			await update.download(
				(event) => {
					if (event.event === "Started") {
						size = event.data.contentLength;

						this.status.set({
							type: "downloading",
							version: update.version,
							size,
							progress,
						});
					} else if (event.event === "Progress") {
						progress += event.data.chunkLength;

						this.status.set({
							type: "downloading",
							version: update.version,
							size,
							progress,
						});
					} else if (event.event === "Finished") {
						this.status.set({
							type: "downloaded",
							version: update.version,
							size: progress,
						});
					}
				},
				{
					timeout: CHECK_INTERVAL / 2,
				},
			);

			// An explicit click installs right away, but the automatic install waits until we're out of a call.
			const auto = await Promise.race([
				this.#install.then(() => false),
				installTimeout.then(idle).then(() => true),
			]);

			this.status.set({ type: "installing", version: update.version });

			// Keep the user out of rooms until the process exits, or a join would be dropped moments later.
			// relaunch() can return before the exit, so the guard is released only on failure.
			const unblock = auto ? Local.join.subscribe((join) => join && Local.join.set(false)) : undefined;
			try {
				await update.install();
				await Process.relaunch();
			} catch (error) {
				unblock?.();
				throw error;
			}
		} catch (error) {
			console.error("failed checking for update:", error);
			this.status.set({ type: "error", error: error instanceof Error ? error.message : String(error) });
		}
	}

	async #run() {
		await this.#check();

		const jitter = Math.floor(Math.random() * CHECK_INTERVAL);

		await new Promise((resolve) => setTimeout(resolve, jitter));

		for (;;) {
			await this.#check();
			await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
		}
	}
}

// Resolves once the user is not joined to a room, so a relaunch can't drop a call.
async function idle() {
	while (Local.join.peek()) await Local.join.changed();
}

export const update = new Update();
