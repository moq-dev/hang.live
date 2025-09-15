import * as Process from "@tauri-apps/plugin-process";
import * as Updater from "@tauri-apps/plugin-updater";

if (
	import.meta.env.TAURI_ENV_PLATFORM === "windows" ||
	import.meta.env.TAURI_ENV_PLATFORM === "darwin" ||
	import.meta.env.TAURI_ENV_PLATFORM === "linux"
) {
	const check = async () => {
		const update = await Updater.check();
		if (update) {
			console.log(`found update ${update.version} from ${update.date} with notes ${update.body}`);
			await update.download();
			await update.install(); // TODO only install if we're not in a room
			await Process.relaunch();
		}
	};

	check();

	const delay = 1000 * 60 * 60 * 12;
	const jitter = Math.floor(Math.random() * delay);

	setTimeout(() => {
		check();
		setInterval(check, delay);
	}, jitter);
}
