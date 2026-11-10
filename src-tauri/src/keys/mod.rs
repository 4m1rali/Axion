use std::sync::Arc;

use russh::keys::{decode_secret_key, PrivateKey, PrivateKeyWithHashAlg};
use russh::keys::ssh_key::{Algorithm, LineEnding};
use russh::keys::ssh_key::rand_core::OsRng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::creds::{
    delete_key_material, get_key_passphrase, get_private_key_blob, set_key_passphrase,
    set_private_key_blob,
};
use crate::error::{AxionError, AxionResult};
use crate::persist::known_hosts::fingerprint_sha256;
use crate::persist::paths::keys_index_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyRecord {
    pub id: String,
    pub name: String,
    pub algorithm: String,
    pub fingerprint_sha256: String,
    pub public_key_openssh: String,
    pub has_passphrase: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KeyStore {
    schema_version: u32,
    keys: Vec<KeyRecord>,
}

impl Default for KeyStore {
    fn default() -> Self {
        Self {
            schema_version: 1,
            keys: Vec::new(),
        }
    }
}

fn load_store() -> AxionResult<KeyStore> {
    let path = keys_index_path()?;
    if !path.exists() {
        return Ok(KeyStore::default());
    }
    let data = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

fn save_store(store: &KeyStore) -> AxionResult<()> {
    let path = keys_index_path()?;
    let data = serde_json::to_string_pretty(store)?;
    std::fs::write(path, data)?;
    Ok(())
}

pub fn list_keys() -> AxionResult<Vec<KeyRecord>> {
    Ok(load_store()?.keys)
}

pub fn delete_key(id: &str) -> AxionResult<()> {
    delete_key_material(id)?;
    let mut store = load_store()?;
    store.keys.retain(|k| k.id != id);
    save_store(&store)?;
    Ok(())
}

pub fn import_key(name: String, material: &str, passphrase: Option<&str>) -> AxionResult<KeyRecord> {
    let key = decode_secret_key(material, passphrase).map_err(|e| AxionError::from(e.to_string()))?;
    persist_key_record(name, key, passphrase.is_some())
}

pub fn generate_ed25519(name: String, _passphrase: Option<&str>) -> AxionResult<KeyRecord> {
    let key = PrivateKey::random(&mut OsRng, Algorithm::Ed25519)
        .map_err(|e| AxionError::from(e.to_string()))?;
    persist_key_record(name, key, false)
}

fn persist_key_record(name: String, key: PrivateKey, has_passphrase: bool) -> AxionResult<KeyRecord> {
    let id = Uuid::new_v4().to_string();
    let public = key.public_key();
    let fp = fingerprint_sha256(public)?;
    let openssh = public
        .to_openssh()
        .map_err(|e| AxionError::from(e.to_string()))?
        .to_string();
    let private_bytes = key
        .to_openssh(LineEnding::default())
        .map_err(|e| AxionError::from(e.to_string()))?
        .to_string()
        .into_bytes();
    set_private_key_blob(&id, &private_bytes)?;
    let record = KeyRecord {
        id: id.clone(),
        name,
        algorithm: format!("{:?}", public.algorithm()),
        fingerprint_sha256: fp,
        public_key_openssh: openssh,
        has_passphrase,
    };
    let mut store = load_store()?;
    store.keys.push(record.clone());
    save_store(&store)?;
    Ok(record)
}

pub fn load_private_key(key_id: &str) -> AxionResult<PrivateKey> {
    let blob = get_private_key_blob(key_id)?.ok_or_else(|| AxionError::from("key material not found"))?;
    let text = String::from_utf8(blob).map_err(|e| AxionError::from(e.to_string()))?;
    let passphrase = get_key_passphrase(key_id)?;
    decode_secret_key(&text, passphrase.as_deref()).map_err(|e| AxionError::from(e.to_string()))
}

pub fn store_passphrase(key_id: &str, passphrase: &str) -> AxionResult<()> {
    set_key_passphrase(key_id, passphrase)
}

pub fn key_for_auth(key_id: &str) -> AxionResult<PrivateKeyWithHashAlg> {
    let key = Arc::new(load_private_key(key_id)?);
    Ok(PrivateKeyWithHashAlg::new(key, None))
}

pub fn import_identity_file(path: &str, name: String) -> AxionResult<KeyRecord> {
    let data = std::fs::read_to_string(path)?;
    import_key(name, &data, None)
}
