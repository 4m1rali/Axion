use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::paths::tunnels_path;
use crate::error::AxionResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TunnelKind {
    Local,
    Remote,
    Dynamic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelConfig {
    pub id: String,
    pub name: String,
    pub kind: TunnelKind,
    pub local_address: String,
    pub local_port: u16,
    pub destination_address: Option<String>,
    pub destination_port: Option<u16>,
    pub profile_id: Option<String>,
    pub connection_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TunnelStore {
    schema_version: u32,
    tunnels: Vec<TunnelConfig>,
}

impl Default for TunnelStore {
    fn default() -> Self {
        Self {
            schema_version: 1,
            tunnels: Vec::new(),
        }
    }
}

fn load() -> AxionResult<TunnelStore> {
    let path = tunnels_path()?;
    if !path.exists() {
        return Ok(TunnelStore::default());
    }
    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

fn save(store: &TunnelStore) -> AxionResult<()> {
    let path = tunnels_path()?;
    let data = serde_json::to_string_pretty(store)?;
    std::fs::write(path, data)?;
    Ok(())
}

pub fn list_tunnels() -> AxionResult<Vec<TunnelConfig>> {
    Ok(load()?.tunnels)
}

pub fn upsert_tunnel(mut tunnel: TunnelConfig) -> AxionResult<TunnelConfig> {
    let mut store = load()?;
    if tunnel.id.is_empty() {
        tunnel.id = Uuid::new_v4().to_string();
    }
    if let Some(existing) = store.tunnels.iter_mut().find(|t| t.id == tunnel.id) {
        *existing = tunnel.clone();
    } else {
        store.tunnels.push(tunnel.clone());
    }
    save(&store)?;
    Ok(tunnel)
}

pub fn delete_tunnel(id: &str) -> AxionResult<()> {
    let mut store = load()?;
    store.tunnels.retain(|t| t.id != id);
    save(&store)?;
    Ok(())
}
