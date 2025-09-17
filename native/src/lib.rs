// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
	format!("Hello, {name}! You've been greeted from Rust!")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	#[allow(unused_mut)]
	add_desktop_plugins(
		tauri::Builder::default()
			.plugin(tauri_plugin_opener::init())
			.plugin(tauri_plugin_process::init()),
	)
	.invoke_handler(tauri::generate_handler![greet])
	.run(tauri::generate_context!())
	.expect("error while running tauri application");
}

#[cfg(desktop)]
fn add_desktop_plugins<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
	builder.plugin(tauri_plugin_updater::Builder::new().build())
}

#[cfg(not(desktop))]
fn add_desktop_plugins<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
	builder
}
