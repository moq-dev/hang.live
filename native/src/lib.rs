use tauri::Emitter;

#[cfg(desktop)]
mod update;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let mut t = tauri::Builder::default();

	#[cfg(desktop)]
	{
		use tauri::Manager;
		t = t.plugin(tauri_plugin_updater::Builder::new().build());

		// Start background update checker (desktop only)
		t = t.setup(|app| {
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				update::run(handle).await.expect("update loop failed");
			});
			Ok(())
		});

		// Must be before deep link
		t = t.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
			// Focus the main window
			let _ = app.get_webview_window("main").expect("no main window").set_focus();
		}));
	};

	t = t.plugin(tauri_plugin_deep_link::init());

	t = t
		.plugin(tauri_plugin_oauth::init())
		.invoke_handler(tauri::generate_handler![start_server]);

	// On Linux and Windows, register deep links at run time when in development mode.
	// Otherwise the app would need to be installed to register deep links.
	#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
	{
		t = t.setup(|app| {
			use tauri_plugin_deep_link::DeepLinkExt;
			app.deep_link().register_all()?;
			Ok(())
		});
	}
	t = t.plugin(tauri_plugin_opener::init());
	t = t.plugin(tauri_plugin_process::init());

	t.run(tauri::generate_context!())
		.expect("error while running tauri application");
}

// Instead of relying on deep links, this oauth plugin spawns a localhost server.
// It's so stupid but basically:
// - Google redirects to api.hang.live/oauth/google/callback?token&state
// - api.hang.live redirects to localhost:8000/oauth/<redirect>?token&state
// - localhost:8000 tells the JS frontend to redirect to /oauth/<redirect>?token&state
// - /oauth/<redirect>?token&state parses the token and redirects to /<redirect>
//
// We could combine the last two steps into one but this way matches the web flow.
#[tauri::command]
async fn start_server(window: tauri::Window) -> Result<u16, String> {
	tauri_plugin_oauth::start(move |url| {
		// TODO: Because of the unprotected localhost port, you must verify the URL here.
		// Preferebly send back only the token, or nothing at all if you can handle everything else in Rust.
		let _ = window.emit("redirect_uri", url);

		// Focus the main window
		#[cfg(desktop)]
		{
			use tauri::Manager;
			let _ = window.get_webview_window("main").expect("no main window").set_focus();
		}
	})
	.map_err(|err| err.to_string())
}
