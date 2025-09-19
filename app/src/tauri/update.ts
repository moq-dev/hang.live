import * as Tauri from "./index";

if (Tauri.Process && Tauri.Updater && Tauri.DESKTOP) {
	const check = async () => {
		const update = await Tauri.Updater?.check();
		if (update) {
			console.log(`found update ${update.version} from ${update.date} with notes ${update.body}`);
			await update.download();
			await update.install(); // TODO only install if we're not in a room
			await Tauri.Process?.relaunch();
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
