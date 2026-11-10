use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::State;

use crate::keys;
use crate::creds::{delete_llm_api_key, delete_password, get_llm_api_key, set_llm_api_key, set_password};
use crate::llm::{self, ChatMessage};
use crate::persist::known_hosts::remove_host;
use crate::persist::profiles::{
    delete_profile, duplicate_profile, export_profiles, get_profile, import_profiles, list_profiles,
    upsert_profile, ConnectionProfile, ProfileExportBundle,
};
use crate::persist::settings::{load_settings, save_settings, AppSettings};
use crate::persist::tunnels_store::{delete_tunnel, list_tunnels, upsert_tunnel, TunnelConfig};
use crate::sftp::{FileEntry, TransferProgress};
use crate::ssh::config_import::{self, SshConfigHost};
use crate::ssh::monitor::RemoteServerMetrics;
use crate::ssh::types::{ConnectOutcome, ConnectRequest, ConnectionSummary};
use crate::state::SharedState;
use crate::tunnel::ActiveTunnel;
use crate::AxionResult;
#[tauri::command]
pub fn system_identity() -> crate::system_identity::SystemIdentity {
    crate::system_identity::resolve_system_identity()
}

#[tauri::command]
pub fn get_settings() -> AxionResult<AppSettings> {
    load_settings()
}

#[tauri::command]
pub fn save_app_settings(settings: AppSettings) -> AxionResult<()> {
    save_settings(&settings)
}

#[tauri::command]
pub fn llm_has_api_key() -> AxionResult<bool> {
    Ok(get_llm_api_key()?.is_some())
}

#[tauri::command]
pub fn llm_set_api_key(api_key: String) -> AxionResult<()> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return delete_llm_api_key();
    }
    set_llm_api_key(trimmed)
}

#[tauri::command]
pub async fn llm_list_models(api_url: String) -> AxionResult<Vec<String>> {
    llm::list_models(&api_url).await
}

#[tauri::command]
pub async fn llm_chat(
    api_url: String,
    model: String,
    messages: Vec<ChatMessage>,
) -> AxionResult<llm::ChatCompletionResult> {
    llm::chat_completion(&api_url, &model, messages).await
}

#[tauri::command]
pub fn llm_abort_chat() -> AxionResult<()> {
    llm::abort_chat();
    Ok(())
}

#[tauri::command]
pub fn profiles_list() -> AxionResult<Vec<ConnectionProfile>> {
    list_profiles()
}

#[tauri::command]
pub fn profiles_save(profile: ConnectionProfile) -> AxionResult<ConnectionProfile> {
    upsert_profile(profile)
}

#[tauri::command]
pub fn profiles_delete(id: String) -> AxionResult<()> {
    let _ = delete_password(&id);
    delete_profile(&id)
}

#[tauri::command]
pub fn profiles_store_password(profile_id: String, password: String) -> AxionResult<()> {
    set_password(&profile_id, &password)
}

#[tauri::command]
pub fn profiles_duplicate(id: String) -> AxionResult<ConnectionProfile> {
    duplicate_profile(&id)
}

#[tauri::command]
pub fn profiles_export() -> AxionResult<ProfileExportBundle> {
    export_profiles()
}

#[tauri::command]
pub fn profiles_import(bundle: ProfileExportBundle) -> AxionResult<Vec<ConnectionProfile>> {
    import_profiles(bundle)
}

fn merge_profile_into_request(request: &mut ConnectRequest) -> AxionResult<()> {
    if let Some(profile_id) = &request.profile_id {
        if let Some(profile) = get_profile(profile_id)? {
            if request.host.is_empty() {
                request.host = profile.host;
            }
            if request.port == 0 {
                request.port = profile.port;
            }
            if request.username.is_empty() {
                request.username = profile.username;
            }
            if request.key_ref.is_none() {
                request.key_ref = profile.key_ref;
            }
            if request.proxy_jump.is_none() {
                request.proxy_jump = profile.proxy_jump;
            }
            if request.transport_proxy.is_none() {
                request.transport_proxy = profile.transport_proxy.clone();
            }
            request.auth_method = match profile.auth_method {
                crate::persist::profiles::AuthMethod::Password => "password".to_string(),
                crate::persist::profiles::AuthMethod::PublicKey => "publicKey".to_string(),
            };
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_connect(mut request: ConnectRequest, state: State<'_, SharedState>) -> AxionResult<ConnectOutcome> {
    merge_profile_into_request(&mut request)?;
    state.sessions.connect(request).await
}

#[tauri::command]
pub async fn ssh_resolve_host_key(
    state: State<'_, SharedState>,
    pending_id: String,
    accept: bool,
) -> AxionResult<()> {
    state.sessions.resolve_host_key(&pending_id, accept).await
}

#[tauri::command]
pub fn ssh_list_connections(state: State<'_, SharedState>) -> Vec<ConnectionSummary> {
    state.sessions.list_connections()
}

#[tauri::command]
pub async fn ssh_server_metrics(
    state: State<'_, SharedState>,
    connection_id: String,
) -> AxionResult<RemoteServerMetrics> {
    state.sessions.ensure_handle_alive(&connection_id).await?;
    let handle = state.sessions.handle_arc(&connection_id)?;
    let lane = state.sessions.channel_lane(&connection_id)?;
    crate::ssh::monitor::fetch_server_metrics(handle, lane).await
}

#[tauri::command]
pub async fn ssh_disconnect(state: State<'_, SharedState>, connection_id: String) -> AxionResult<()> {
    state.sftp.lock().await.remove_session(&connection_id);
    state.sessions.disconnect(&connection_id).await
}

#[tauri::command]
pub async fn terminal_open(
    state: State<'_, SharedState>,
    connection_id: String,
    cols: u32,
    rows: u32,
    output: Channel<InvokeResponseBody>,
) -> AxionResult<String> {
    let handle = state.sessions.handle_arc(&connection_id)?;
    let lane = state.sessions.channel_lane(&connection_id)?;
    state
        .sessions
        .terminals()
        .open(&connection_id, handle, lane, cols, rows, output)
        .await
}

#[tauri::command]
pub async fn terminal_input(
    state: State<'_, SharedState>,
    terminal_id: String,
    data: Vec<u8>,
) -> AxionResult<()> {
    state.sessions.terminals().send_input(&terminal_id, data).await
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, SharedState>,
    terminal_id: String,
    cols: u32,
    rows: u32,
) -> AxionResult<()> {
    state.sessions.terminals().resize(&terminal_id, cols, rows).await
}

#[tauri::command]
pub async fn terminal_close(state: State<'_, SharedState>, terminal_id: String) -> AxionResult<()> {
    state.sessions.terminals().close(&terminal_id).await
}

#[tauri::command]
pub async fn sftp_attach(state: State<'_, SharedState>, connection_id: String) -> AxionResult<()> {
    state.sessions.ensure_handle_alive(&connection_id).await?;
    let handle = state.sessions.handle_arc(&connection_id)?;
    let lane = state.sessions.channel_lane(&connection_id)?;
    let sftp = state.sftp.lock().await;
    if sftp.has_session(&connection_id) {
        return Ok(());
    }
    sftp.attach(&connection_id, handle, lane).await
}

#[tauri::command]
pub async fn sftp_connect(mut request: ConnectRequest, state: State<'_, SharedState>) -> AxionResult<ConnectOutcome> {
    merge_profile_into_request(&mut request)?;
    let outcome = state.sessions.connect(request).await?;
    match outcome {
        ConnectOutcome::Connected { connection_id } => {
            let handle = state.sessions.handle_arc(&connection_id)?;
            let lane = state.sessions.channel_lane(&connection_id)?;
            state
                .sftp
                .lock()
                .await
                .attach(&connection_id, handle, lane)
                .await?;
            Ok(ConnectOutcome::Connected { connection_id })
        }
        other => Ok(other),
    }
}

#[tauri::command]
pub async fn sftp_list_remote(state: State<'_, SharedState>, connection_id: String, path: String) -> AxionResult<Vec<FileEntry>> {
    let sftp = state.sftp.lock().await;
    sftp.list_remote(&connection_id, &path).await
}

#[tauri::command]
pub async fn sftp_list_local(state: State<'_, SharedState>, path: String) -> AxionResult<Vec<FileEntry>> {
    let sftp = state.sftp.lock().await;
    sftp.list_local(&path).await
}

#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, SharedState>,
    connection_id: String,
    local_path: String,
    remote_path: String,
    progress: Channel<TransferProgress>,
) -> AxionResult<String> {
    let sftp = state.sftp.lock().await;
    sftp.upload(&connection_id, local_path, remote_path, progress).await
}

#[tauri::command]
pub async fn sftp_download(
    state: State<'_, SharedState>,
    connection_id: String,
    remote_path: String,
    local_path: String,
    progress: Channel<TransferProgress>,
) -> AxionResult<String> {
    let sftp = state.sftp.lock().await;
    sftp.download(&connection_id, remote_path, local_path, progress).await
}

#[tauri::command]
pub async fn sftp_cancel(state: State<'_, SharedState>, transfer_id: String) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.cancel_transfer(&transfer_id)
}

#[tauri::command]
pub async fn sftp_mkdir(state: State<'_, SharedState>, connection_id: String, path: String) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.mkdir_remote(&connection_id, &path).await
}

#[tauri::command]
pub async fn sftp_delete(
    state: State<'_, SharedState>,
    connection_id: String,
    path: String,
    is_dir: bool,
) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.delete_remote(&connection_id, &path, is_dir).await
}

#[tauri::command]
pub async fn sftp_create_file(
    state: State<'_, SharedState>,
    connection_id: String,
    path: String,
) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.create_remote_file(&connection_id, &path).await
}

#[tauri::command]
pub async fn sftp_mkdir_local(state: State<'_, SharedState>, path: String) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.mkdir_local(&path).await
}

#[tauri::command]
pub async fn sftp_create_file_local(state: State<'_, SharedState>, path: String) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.create_local_file(&path).await
}

#[tauri::command]
pub async fn sftp_delete_local(state: State<'_, SharedState>, path: String, is_dir: bool) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.delete_local(&path, is_dir).await
}

#[tauri::command]
pub async fn sftp_rename_local(state: State<'_, SharedState>, from: String, to: String) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.rename_local(&from, &to).await
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, SharedState>,
    connection_id: String,
    from: String,
    to: String,
) -> AxionResult<()> {
    let sftp = state.sftp.lock().await;
    sftp.rename_remote(&connection_id, &from, &to).await
}

#[tauri::command]
pub fn tunnels_list_configs() -> AxionResult<Vec<TunnelConfig>> {
    list_tunnels()
}

#[tauri::command]
pub fn tunnels_save_config(config: TunnelConfig) -> AxionResult<TunnelConfig> {
    upsert_tunnel(config)
}

#[tauri::command]
pub fn tunnels_delete_config(id: String) -> AxionResult<()> {
    delete_tunnel(&id)
}

#[tauri::command]
pub fn tunnels_list_active(state: State<'_, SharedState>) -> Vec<ActiveTunnel> {
    state.sessions.tunnels().list()
}

#[tauri::command]
pub async fn tunnel_start_local(
    state: State<'_, SharedState>,
    connection_id: String,
    local_address: String,
    local_port: u16,
    destination_host: String,
    destination_port: u16,
    acknowledge_public: bool,
) -> AxionResult<String> {
    let handle = state.sessions.handle_arc(&connection_id)?;
    state
        .sessions
        .tunnels()
        .start_local(
            &connection_id,
            handle,
            &local_address,
            local_port,
            &destination_host,
            destination_port,
            acknowledge_public,
        )
        .await
}

#[tauri::command]
pub async fn tunnel_start_dynamic(
    state: State<'_, SharedState>,
    connection_id: String,
    local_address: String,
    local_port: u16,
    acknowledge_public: bool,
) -> AxionResult<String> {
    let handle = state.sessions.handle_arc(&connection_id)?;
    state
        .sessions
        .tunnels()
        .start_dynamic(&connection_id, handle, &local_address, local_port, acknowledge_public)
        .await
}

#[tauri::command]
pub async fn tunnel_stop(state: State<'_, SharedState>, tunnel_id: String) -> AxionResult<()> {
    state.sessions.tunnels().stop(&tunnel_id).await
}

#[tauri::command]
pub fn keys_list() -> AxionResult<Vec<keys::KeyRecord>> {
    keys::list_keys()
}

#[tauri::command]
pub fn keys_delete(id: String) -> AxionResult<()> {
    keys::delete_key(&id)
}

#[tauri::command]
pub fn keys_import(name: String, material: String, passphrase: Option<String>) -> AxionResult<keys::KeyRecord> {
    keys::import_key(name, &material, passphrase.as_deref())
}

#[tauri::command]
pub fn keys_generate(name: String, passphrase: Option<String>) -> AxionResult<keys::KeyRecord> {
    keys::generate_ed25519(name, passphrase.as_deref())
}

#[tauri::command]
pub fn keys_store_passphrase(id: String, passphrase: String) -> AxionResult<()> {
    keys::store_passphrase(&id, &passphrase)
}

#[tauri::command]
pub fn ssh_config_preview() -> AxionResult<Vec<SshConfigHost>> {
    config_import::load_ssh_config_file()
}

#[tauri::command]
pub fn ssh_config_import() -> AxionResult<Vec<ConnectionProfile>> {
    config_import::import_ssh_config_to_profiles()
}

#[tauri::command]
pub fn ssh_config_text() -> AxionResult<String> {
    config_import::read_ssh_config_raw()
}

#[tauri::command]
pub fn host_key_remove(host: String, port: u16) -> AxionResult<()> {
    remove_host(&host, port)
}
