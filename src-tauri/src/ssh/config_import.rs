use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AxionError, AxionResult};
use crate::keys;
use crate::persist::profiles::{upsert_profile, AuthMethod, ConnectionProfile};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigHost {
    pub alias: String,
    pub host_name: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
}

pub fn ssh_config_path() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".ssh").join("config"))
        .unwrap_or_else(|| PathBuf::from(".ssh/config"))
}

fn expand_identity_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if let Some(rest) = trimmed.strip_prefix("~/") {
        dirs::home_dir()
            .map(|home| home.join(rest))
            .unwrap_or_else(|| PathBuf::from(trimmed))
    } else if trimmed.starts_with("~\\") {
        dirs::home_dir()
            .map(|home| home.join(trimmed.trim_start_matches("~\\")))
            .unwrap_or_else(|| PathBuf::from(trimmed))
    } else {
        PathBuf::from(trimmed)
    }
}

pub fn parse_ssh_config(content: &str) -> Vec<SshConfigHost> {
    let mut hosts = Vec::new();
    let mut current: Option<SshConfigHost> = None;
    for raw in content.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let key = parts.next().unwrap_or("").to_ascii_lowercase();
        let value = parts.collect::<Vec<_>>().join(" ");
        if key == "host" {
            if let Some(host) = current.take() {
                hosts.push(host);
            }
            current = Some(SshConfigHost {
                alias: value,
                host_name: None,
                user: None,
                port: None,
                identity_file: None,
                proxy_jump: None,
            });
        } else if let Some(host) = &mut current {
            match key.as_str() {
                "hostname" => host.host_name = Some(value),
                "user" => host.user = Some(value),
                "port" => host.port = value.parse().ok(),
                "identityfile" => host.identity_file = Some(value),
                "proxyjump" => host.proxy_jump = Some(value),
                _ => {}
            }
        }
    }
    if let Some(host) = current {
        hosts.push(host);
    }
    hosts
}

pub fn load_ssh_config_file() -> AxionResult<Vec<SshConfigHost>> {
    let path = ssh_config_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(path)?;
    Ok(parse_ssh_config(&data))
}

pub fn read_ssh_config_raw() -> AxionResult<String> {
    let path = ssh_config_path();
    if !path.exists() {
        return Err(AxionError::from("ssh config not found"));
    }
    Ok(std::fs::read_to_string(path)?)
}

pub fn import_ssh_config_to_profiles() -> AxionResult<Vec<ConnectionProfile>> {
    let _ = read_ssh_config_raw()?;
    let entries = load_ssh_config_file()?;
    let mut imported = Vec::new();
    for entry in entries {
        if entry.alias.contains('*') || entry.alias.contains('?') {
            continue;
        }
        let host = entry
            .host_name
            .clone()
            .unwrap_or_else(|| entry.alias.clone());
        let mut key_ref = None;
        if let Some(identity) = &entry.identity_file {
            let expanded = expand_identity_path(identity);
            if expanded.exists() {
                let name = format!("{} key", entry.alias);
                if let Ok(record) =
                    keys::import_identity_file(expanded.to_string_lossy().as_ref(), name)
                {
                    key_ref = Some(record.id);
                }
            }
        }
        let profile = ConnectionProfile {
            id: Uuid::new_v4().to_string(),
            name: entry.alias.clone(),
            host,
            port: entry.port.unwrap_or(22),
            username: entry.user.unwrap_or_else(|| "root".to_string()),
            auth_method: if key_ref.is_some() {
                AuthMethod::PublicKey
            } else {
                AuthMethod::Password
            },
            key_ref,
            remember_password: false,
            favorite: false,
            last_connected_at: None,
            tunnel_ids: Vec::new(),
            proxy_jump: entry.proxy_jump,
            identity_file: entry.identity_file,
            transport_proxy: None,
        };
        imported.push(upsert_profile(profile)?);
    }
    Ok(imported)
}
