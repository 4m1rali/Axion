use serde::{Deserialize, Serialize};

use super::paths::settings_path;
use crate::error::AxionResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub accent_color: String,
    pub ui_density: String,
    pub terminal_font_family: String,
    pub terminal_font_size: u16,
    pub default_ssh_port: u16,
    pub connection_timeout_ms: u64,
    pub keepalive_interval_secs: u64,
    pub reconnect_enabled: bool,
    pub strict_host_key: bool,
    pub max_concurrent_transfers: usize,
    pub transfer_buffer_size: usize,
    pub default_download_dir: String,
    pub launch_minimized: bool,
    pub minimize_to_tray: bool,
    pub confirm_close_active: bool,
    #[serde(default = "default_true")]
    pub terminal_command_history: bool,
    #[serde(default = "default_true")]
    pub terminal_command_hints: bool,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default)]
    pub llm_enabled: bool,
    #[serde(default = "default_llm_provider")]
    pub llm_provider: String,
    #[serde(default)]
    pub llm_api_url: String,
    #[serde(default = "default_llm_model")]
    pub llm_model: String,
    #[serde(default)]
    pub llm_models_cache: Vec<String>,
}

fn default_true() -> bool {
    true
}

fn default_theme_mode() -> String {
    "dark".to_string()
}

fn default_locale() -> String {
    "en".to_string()
}

fn default_llm_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_llm_provider() -> String {
    "openai".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        let download = dirs::download_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| String::new());
        Self {
            schema_version: 1,
            accent_color: "#80C0E0".to_string(),
            ui_density: "comfortable".to_string(),
            terminal_font_family: "Consolas".to_string(),
            terminal_font_size: 14,
            default_ssh_port: 22,
            connection_timeout_ms: 15_000,
            keepalive_interval_secs: 30,
            reconnect_enabled: false,
            strict_host_key: true,
            max_concurrent_transfers: 3,
            transfer_buffer_size: 64 * 1024,
            default_download_dir: download,
            launch_minimized: false,
            minimize_to_tray: false,
            confirm_close_active: true,
            terminal_command_history: true,
            terminal_command_hints: true,
            theme_mode: default_theme_mode(),
            locale: default_locale(),
            llm_enabled: false,
            llm_provider: default_llm_provider(),
            llm_api_url: String::new(),
            llm_model: default_llm_model(),
            llm_models_cache: Vec::new(),
        }
    }
}

pub fn load_settings() -> AxionResult<AppSettings> {
    let path = settings_path()?;
    if !path.exists() {
        let settings = AppSettings::default();
        save_settings(&settings)?;
        return Ok(settings);
    }
    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

pub fn save_settings(settings: &AppSettings) -> AxionResult<()> {
    let path = settings_path()?;
    let data = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, data)?;
    Ok(())
}
