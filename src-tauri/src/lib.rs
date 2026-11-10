mod app_update;
mod commands;
mod creds;
mod error;
mod keys;
mod llm;
mod persist;
mod sftp;
mod ssh;
mod state;
mod system_identity;
mod terminal;
mod tunnel;

pub use error::{AxionError, AxionResult};

use std::sync::Arc;

use state::{AppState, SharedState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon().cloned() {
                    let _ = window.set_icon(icon);
                }
            }
            let sessions = ssh::session::SessionManager::new(app.handle().clone());
            let shared: SharedState = Arc::new(AppState::new(sessions));
            app.manage(shared);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::system_identity,
            commands::save_app_settings,
            commands::llm_has_api_key,
            commands::llm_set_api_key,
            commands::llm_list_models,
            commands::llm_chat,
            commands::llm_abort_chat,
            commands::profiles_list,
            commands::profiles_save,
            commands::profiles_delete,
            commands::profiles_store_password,
            commands::profiles_duplicate,
            commands::profiles_export,
            commands::profiles_import,
            commands::ssh_connect,
            commands::ssh_resolve_host_key,
            commands::ssh_list_connections,
            commands::ssh_server_metrics,
            commands::ssh_disconnect,
            commands::terminal_open,
            commands::terminal_input,
            commands::terminal_resize,
            commands::terminal_close,
            commands::sftp_attach,
            commands::sftp_connect,
            commands::sftp_list_remote,
            commands::sftp_list_local,
            commands::sftp_upload,
            commands::sftp_download,
            commands::sftp_cancel,
            commands::sftp_mkdir,
            commands::sftp_delete,
            commands::sftp_create_file,
            commands::sftp_mkdir_local,
            commands::sftp_create_file_local,
            commands::sftp_delete_local,
            commands::sftp_rename_local,
            commands::sftp_rename,
            commands::tunnels_list_configs,
            commands::tunnels_save_config,
            commands::tunnels_delete_config,
            commands::tunnels_list_active,
            commands::tunnel_start_local,
            commands::tunnel_start_dynamic,
            commands::tunnel_stop,
            commands::keys_list,
            commands::keys_delete,
            commands::keys_import,
            commands::keys_generate,
            commands::keys_store_passphrase,
            commands::ssh_config_preview,
            commands::ssh_config_import,
            commands::ssh_config_text,
            commands::host_key_remove,
            app_update::install_release_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
