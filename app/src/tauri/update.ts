import { Signal } from "@kixelated/signals";
import * as Process from "@tauri-apps/plugin-process";
import * as Updater from "@tauri-apps/plugin-updater";

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

			await Promise.race([this.#install, installTimeout]);

			this.status.set({ type: "installing", version: update.version });

			await update.install();
			await Process.relaunch();
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

export const update = new Update();
