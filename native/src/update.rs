use std::time::Duration;
use tauri_plugin_updater::UpdaterExt;

const CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24); // 24 hours
const CHECK_AGAIN_INTERVAL: Duration = Duration::from_secs(60 * 60 * 12); // 12 hours

// The UI handles this normally, but we perform a backup check in Rust.
// This should be the last resort because it doesn't prompt the user to install the update.
pub async fn run(app: tauri::AppHandle) -> anyhow::Result<()> {
	loop {
		// Add jitter to avoid thundering herd
		let jitter = rand::random::<u64>() % (60 * 60); // 0-1 hour jitter
		let delay = CHECK_INTERVAL + Duration::from_secs(jitter);
		tokio::time::sleep(delay).await;

		// Catch errors on each individual check
		if let Err(e) = check(&app).await {
			eprintln!("Update check failed: {e}");
		}
	}
}

async fn check(app: &tauri::AppHandle) -> anyhow::Result<()> {
	// Check for updates
	let update = match app.updater()?.check().await? {
		Some(update) => update,
		None => return Ok(()),
	};

	let version = &update.version;
	println!("Found update version {version}");

	// Require the same version found in two consecutive checks
	tokio::time::sleep(CHECK_AGAIN_INTERVAL).await;

	let update = match app.updater()?.check().await? {
		Some(update) if update.version == *version => update,
		// NOTE: We'll try again in a day.
		Some(update) => anyhow::bail!("version changed: {} -> {}", version, update.version),
		None => return Ok(()),
	};

	let mut downloaded = 0;

	// Download the update
	let data = update
		.download(
			|chunk_length, content_length| {
				downloaded += chunk_length;
				println!("downloaded {downloaded} from {content_length:?}");
			},
			|| {
				println!("download finished");
			},
		)
		.await?;

	println!("installing update and restarting application");

	// Install and restart (some platforms auto-restart)
	update.install(data)?;
	app.restart();
}
