use base64::Engine;
use keyring::Entry;

use crate::error::{AxionError, AxionResult};

const SERVICE: &str = "Axion";

pub fn set_password(profile_id: &str, password: &str) -> AxionResult<()> {
    let entry = Entry::new(SERVICE, &format!("profile/{profile_id}/password"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    entry
        .set_password(password)
        .map_err(|e| AxionError::from(e.to_string()))
}

pub fn get_password(profile_id: &str) -> AxionResult<Option<String>> {
    let entry = Entry::new(SERVICE, &format!("profile/{profile_id}/password"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}

pub fn delete_password(profile_id: &str) -> AxionResult<()> {
    let entry = Entry::new(SERVICE, &format!("profile/{profile_id}/password"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}

pub fn set_key_passphrase(key_id: &str, passphrase: &str) -> AxionResult<()> {
    let entry = Entry::new(SERVICE, &format!("key/{key_id}/passphrase"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    entry
        .set_password(passphrase)
        .map_err(|e| AxionError::from(e.to_string()))
}

pub fn get_key_passphrase(key_id: &str) -> AxionResult<Option<String>> {
    let entry = Entry::new(SERVICE, &format!("key/{key_id}/passphrase"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}

pub fn set_private_key_blob(key_id: &str, blob: &[u8]) -> AxionResult<()> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(blob);
    let entry = Entry::new(SERVICE, &format!("key/{key_id}/private"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    entry
        .set_password(&encoded)
        .map_err(|e| AxionError::from(e.to_string()))
}

pub fn get_private_key_blob(key_id: &str) -> AxionResult<Option<Vec<u8>>> {
    let entry = Entry::new(SERVICE, &format!("key/{key_id}/private"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    match entry.get_password() {
        Ok(value) => {
            let bytes = base64::engine::general_purpose::STANDARD.decode(value)
                .map_err(|e| AxionError::from(e.to_string()))?;
            Ok(Some(bytes))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}

pub fn set_llm_api_key(key: &str) -> AxionResult<()> {
    let entry = Entry::new(SERVICE, "llm/api_key").map_err(|e| AxionError::from(e.to_string()))?;
    entry
        .set_password(key)
        .map_err(|e| AxionError::from(e.to_string()))
}

pub fn get_llm_api_key() -> AxionResult<Option<String>> {
    let entry = Entry::new(SERVICE, "llm/api_key").map_err(|e| AxionError::from(e.to_string()))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}

pub fn delete_llm_api_key() -> AxionResult<()> {
    let entry = Entry::new(SERVICE, "llm/api_key").map_err(|e| AxionError::from(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}

pub fn delete_key_material(key_id: &str) -> AxionResult<()> {
    let _ = Entry::new(SERVICE, &format!("key/{key_id}/passphrase"))
        .and_then(|e| e.delete_credential());
    let entry = Entry::new(SERVICE, &format!("key/{key_id}/private"))
        .map_err(|e| AxionError::from(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AxionError::from(e.to_string())),
    }
}
