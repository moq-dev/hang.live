import { ProgressInfo } from "@huggingface/transformers";

export class Progress {
	#models = new Map<string, Map<string, { loaded: number; total: number } | undefined>>();
	#next: Promise<number>;
	#resolve?: (value: number) => void;

	constructor() {
		this.#next = new Promise((resolve) => {
			this.#resolve = resolve;
		});
	}

	// Group status by name and file.
	update(info: ProgressInfo) {
		if (!this.#resolve) return;

		if (info.status === "ready") {
			this.#resolve(1);
			this.#resolve = undefined;
			// No new #next on purpose.
			return;
		}

		let model = this.#models.get(info.name);
		if (!model) {
			model = new Map();
			this.#models.set(info.name, model);
		}

		if (info.status === "progress") {
			let file = model.get(info.file);
			if (!file) {
				file = { loaded: info.loaded, total: info.total };
				model.set(info.file, file);
			} else {
				file.loaded = info.loaded;
				file.total = info.total;
			}
		} else if (info.status === "initiate" || info.status === "download") {
			if (!model.has(info.file)) {
				// We don't know the total size yet.
				model.set(info.file, undefined);
			}
		} else if (info.status === "done") {
			const file = model.get(info.file);
			if (file) {
				file.loaded = file.total;
			}
		}

		// Calculate the progress based on what we know
		let total = 0;
		let loaded = 0;
		let known = 0;
		let unknown = 0;

		for (const model of this.#models.values()) {
			for (const file of model.values()) {
				if (file === undefined) {
					unknown++;
					continue;
				}

				total += file.total;
				loaded += file.loaded;
				known++;
			}
		}

		// Increase the loaded amount by the average file size.
		let progress = 0;
		if (known > 0 && total > 0) {
			total += unknown * (total / known);
			progress = loaded / total;
		}

		this.#resolve(progress);

		if (progress === 1) {
			this.#resolve = undefined;
		} else {
			this.#next = new Promise((resolve) => {
				this.#resolve = resolve;
			});
		}
	}

	// Returns 1 when loaded.
	async next(): Promise<number> {
		return await this.#next;
	}
}
