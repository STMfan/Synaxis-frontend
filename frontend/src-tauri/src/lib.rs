
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WindowEvent};
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use std::io::Write;

struct CloseBehavior { hide: AtomicBool, tray_available: AtomicBool }
#[tauri::command]
fn set_close_behavior(hide: bool, state: tauri::State<CloseBehavior>) { state.hide.store(hide, Ordering::Relaxed); }
#[tauri::command]
fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(desktop)]
    { window.minimize().map_err(|e| e.to_string()) }
    #[cfg(mobile)]
    { let _ = window; Ok(()) }
}
#[tauri::command]
fn close_window(window: tauri::WebviewWindow) -> Result<(), String> { window.close().map_err(|e| e.to_string()) }
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.len() > 32 * 1024 * 1024 { return Err("File exceeds 32 MiB".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(path) = app.dialog().file().set_file_name(&name).blocking_save_file() {
            let mut options = tauri_plugin_fs::OpenOptions::new();
            options.write(true).create(true).truncate(true);
            let mut file = app.fs().open(path, options).map_err(|e| e.to_string())?;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
#[cfg(desktop)]
fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| { show(app); }));
    builder
        .manage(CloseBehavior { hide: AtomicBool::new(true), tray_available: AtomicBool::new(false) })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_secure_keystore::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![set_close_behavior, minimize_window, close_window, save_file])
        .setup(|app| {
            #[cfg(mobile)]
            let _ = app;
            #[cfg(desktop)]
            {
            let open = MenuItem::with_id(app, "open", "打开研习室", true, None::<&str>)?;
            let new = MenuItem::with_id(app, "new", "新提问", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Synaxis", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &new, &quit])?;
            let mut builder = TrayIconBuilder::new().menu(&menu).tooltip("Synaxis · 研习室").show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() { builder = builder.icon(icon.clone()); }
            let result = builder.on_menu_event(|app, event| match event.id.as_ref() {
                "quit" => app.exit(0),
                "new" => { show(app); let _ = app.emit("navigate", "home"); },
                _ => show(app),
            }).on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { show(tray.app_handle()); }
            }).build(app);
            // Linux desktops without a tray must keep a normal close path.
            app.state::<CloseBehavior>().tray_available.store(result.is_ok(), Ordering::Relaxed);
            if let Err(error) = result { eprintln!("Tray unavailable: {error}"); }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let behavior = window.state::<CloseBehavior>();
                if behavior.hide.load(Ordering::Relaxed) && behavior.tray_available.load(Ordering::Relaxed) {
                    if window.hide().is_ok() { api.prevent_close(); }
                }
            }
        })
        .run(tauri::generate_context!()).expect("Synaxis native application failed");
}


