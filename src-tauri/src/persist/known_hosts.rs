use std::collections::HashMap;

use russh::keys::ssh_key::{HashAlg, PublicKey};
use serde::{Deserialize, Serialize};

use super::paths::known_hosts_path;
use crate::error::AxionResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrustState {
    Known,
    Unknown,
    Changed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyInfo {
    pub host: String,
    pub port: u16,
    pub fingerprint_sha256: String,
    pub algorithm: String,
    pub trust_state: TrustState,
}

pub fn host_label(host: &str, port: u16) -> String {
    if port == 22 {
        host.to_string()
    } else {
        format!("[{host}]:{port}")
    }
}

pub fn fingerprint_sha256(key: &PublicKey) -> AxionResult<String> {
    let fp = key.fingerprint(HashAlg::Sha256);
    Ok(format!("SHA256:{fp}"))
}

pub fn algorithm_name(key: &PublicKey) -> String {
    format!("{:?}", key.algorithm())
}

fn load_map() -> AxionResult<HashMap<String, String>> {
    let path = known_hosts_path()?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = std::fs::read_to_string(path)?;
    let mut map = HashMap::new();
    for line in data.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        if let (Some(h), Some(f)) = (parts.next(), parts.next()) {
            map.insert(h.to_string(), f.to_string());
        }
    }
    Ok(map)
}

fn save_map(map: &HashMap<String, String>) -> AxionResult<()> {
    let path = known_hosts_path()?;
    let mut lines: Vec<String> = map.iter().map(|(h, f)| format!("{h} {f}")).collect();
    lines.sort();
    std::fs::write(path, lines.join("\n"))?;
    Ok(())
}

pub fn evaluate(host: &str, port: u16, key: &PublicKey) -> AxionResult<HostKeyInfo> {
    let label = host_label(host, port);
    let fp = fingerprint_sha256(key)?;
    let algo = algorithm_name(key);
    let map = load_map()?;
    let trust_state = match map.get(&label) {
        None => TrustState::Unknown,
        Some(existing) if existing == &fp => TrustState::Known,
        Some(_) => TrustState::Changed,
    };
    Ok(HostKeyInfo {
        host: host.to_string(),
        port,
        fingerprint_sha256: fp,
        algorithm: algo,
        trust_state,
    })
}

pub fn trust_host(host: &str, port: u16, key: &PublicKey) -> AxionResult<()> {
    let label = host_label(host, port);
    let fp = fingerprint_sha256(key)?;
    let mut map = load_map()?;
    map.insert(label, fp);
    save_map(&map)?;
    Ok(())
}

pub fn remove_host(host: &str, port: u16) -> AxionResult<()> {
    let label = host_label(host, port);
    let mut map = load_map()?;
    map.remove(&label);
    save_map(&map)?;
    Ok(())
}
