import * as Process from "@tauri-apps/plugin-process";
import * as Updater from "@tauri-apps/plugin-updater";

// VERY important that this doesn't throw an error
async function check() {
	try {
		console.log("checking for update");
		const update = await Updater.check({ allowDowngrades: true });
		if (!update) return;

		console.log(`found update ${update.version} from ${update.date} with notes ${update.body}`);

		await update.download();
		await update.install(); // TODO only install if we're not in a room
		await Process.relaunch();
	} catch (error) {
		console.error("failed checking for update:", error);
	}
}

// VERY important that this doesn't throw an error
export async function run() {
	await check();

	const delay = 1000 * 60 * 60 * 12;
	const jitter = Math.floor(Math.random() * delay);

	await new Promise((resolve) => setTimeout(resolve, jitter));

	for (;;) {
		await check();
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}
