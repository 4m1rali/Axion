use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransportProxy {
    #[serde(rename = "type")]
    pub proxy_type: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub profile_id: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub remember_password: bool,
    pub key_ref: Option<String>,
    #[serde(default)]
    pub jump_chain: Vec<JumpHop>,
    #[serde(default)]
    pub proxy_jump: Option<String>,
    #[serde(default)]
    pub transport_proxy: Option<TransportProxy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHop {
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub key_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectOutcome {
    Connected { connection_id: String },
    HostKeyRequired {
        pending_id: String,
        prompt: crate::persist::known_hosts::HostKeyInfo,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSummary {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub connected_at: String,
}
