use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::paths::profiles_path;
use crate::error::AxionResult;
use crate::ssh::types::TransportProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    #[serde(alias = "Password")]
    Password,
    #[serde(alias = "PublicKey")]
    PublicKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub key_ref: Option<String>,
    pub remember_password: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub last_connected_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub tunnel_ids: Vec<String>,
    #[serde(default)]
    pub proxy_jump: Option<String>,
    #[serde(default)]
    pub identity_file: Option<String>,
    #[serde(default)]
    pub transport_proxy: Option<TransportProxy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileStore {
    schema_version: u32,
    profiles: Vec<ConnectionProfile>,
}

impl Default for ProfileStore {
    fn default() -> Self {
        Self {
            schema_version: 1,
            profiles: Vec::new(),
        }
    }
}

fn load_store() -> AxionResult<ProfileStore> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(ProfileStore::default());
    }
    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

fn save_store(store: &ProfileStore) -> AxionResult<()> {
    let path = profiles_path()?;
    let data = serde_json::to_string_pretty(store)?;
    std::fs::write(path, data)?;
    Ok(())
}

pub fn list_profiles() -> AxionResult<Vec<ConnectionProfile>> {
    Ok(load_store()?.profiles)
}

pub fn get_profile(id: &str) -> AxionResult<Option<ConnectionProfile>> {
    Ok(load_store()?.profiles.into_iter().find(|p| p.id == id))
}

pub fn upsert_profile(mut profile: ConnectionProfile) -> AxionResult<ConnectionProfile> {
    let mut store = load_store()?;
    if profile.id.is_empty() {
        profile.id = Uuid::new_v4().to_string();
    }
    if let Some(existing) = store.profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile.clone();
    } else {
        store.profiles.push(profile.clone());
    }
    save_store(&store)?;
    Ok(profile)
}

pub fn delete_profile(id: &str) -> AxionResult<()> {
    let mut store = load_store()?;
    store.profiles.retain(|p| p.id != id);
    save_store(&store)?;
    Ok(())
}

pub fn duplicate_profile(id: &str) -> AxionResult<ConnectionProfile> {
    let mut store = load_store()?;
    let source = store
        .profiles
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or("profile not found")?;
    let mut copy = source;
    copy.id = Uuid::new_v4().to_string();
    copy.name = format!("{} (copy)", copy.name);
    store.profiles.push(copy.clone());
    save_store(&store)?;
    Ok(copy)
}

pub fn touch_last_connected(id: &str) -> AxionResult<()> {
    let mut store = load_store()?;
    if let Some(p) = store.profiles.iter_mut().find(|p| p.id == id) {
        p.last_connected_at = Some(Utc::now());
        save_store(&store)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileExportBundle {
    pub schema_version: u32,
    pub profiles: Vec<ExportedProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedProfile {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub favorite: bool,
}

pub fn export_profiles() -> AxionResult<ProfileExportBundle> {
    let profiles = load_store()?.profiles;
    let exported = profiles
        .into_iter()
        .map(|p| ExportedProfile {
            name: p.name,
            host: p.host,
            port: p.port,
            username: p.username,
            auth_method: p.auth_method,
            favorite: p.favorite,
        })
        .collect();
    Ok(ProfileExportBundle {
        schema_version: 1,
        profiles: exported,
    })
}

pub fn import_profiles(bundle: ProfileExportBundle) -> AxionResult<Vec<ConnectionProfile>> {
    let mut store = load_store()?;
    let mut created = Vec::new();
    for item in bundle.profiles {
        let mut name = item.name.clone();
        while store.profiles.iter().any(|p| p.name == name) {
            name = format!("{name} (imported)");
        }
        let profile = ConnectionProfile {
            id: Uuid::new_v4().to_string(),
            name,
            host: item.host,
            port: item.port,
            username: item.username,
            auth_method: item.auth_method,
            key_ref: None,
            remember_password: false,
            favorite: item.favorite,
            last_connected_at: None,
            tunnel_ids: Vec::new(),
            proxy_jump: None,
            identity_file: None,
            transport_proxy: None,
        };
        store.profiles.push(profile.clone());
        created.push(profile);
    }
    save_store(&store)?;
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_round_trip() {
        let profile = ConnectionProfile {
            id: String::new(),
            name: "test-host".to_string(),
            host: "127.0.0.1".to_string(),
            port: 2222,
            username: "test".to_string(),
            auth_method: AuthMethod::Password,
            key_ref: None,
            remember_password: false,
            favorite: true,
            last_connected_at: None,
            tunnel_ids: Vec::new(),
            proxy_jump: Some("jump@bastion".to_string()),
            identity_file: None,
            transport_proxy: None,
        };
        let saved = upsert_profile(profile).expect("upsert");
        let all = list_profiles().expect("list");
        assert!(all.iter().any(|p| p.id == saved.id));
        delete_profile(&saved.id).expect("delete");
    }
}
