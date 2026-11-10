use std::path::PathBuf;

use crate::error::{AxionError, AxionResult};

pub fn app_data_dir() -> AxionResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| AxionError::from("cannot resolve app data directory"))?;
    let dir = base.join("Axion");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn profiles_path() -> AxionResult<PathBuf> {
    Ok(app_data_dir()?.join("profiles.json"))
}

pub fn settings_path() -> AxionResult<PathBuf> {
    Ok(app_data_dir()?.join("settings.json"))
}

pub fn tunnels_path() -> AxionResult<PathBuf> {
    Ok(app_data_dir()?.join("tunnels.json"))
}

pub fn keys_index_path() -> AxionResult<PathBuf> {
    Ok(app_data_dir()?.join("keys.json"))
}

pub fn known_hosts_path() -> AxionResult<PathBuf> {
    Ok(app_data_dir()?.join("known_hosts"))
}

/// Hidden cache for local Windows sign-in identity (avatar + display name). Not for SSH hosts.
pub fn identity_cache_path() -> AxionResult<PathBuf> {
    Ok(app_data_dir()?.join(".pkgmeta"))
}
