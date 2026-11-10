use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use russh::client;
use russh::{ChannelMsg, CryptoVec};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, Semaphore};

use crate::error::{AxionError, AxionResult};
use crate::ssh::handler::SshClientHandler;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServerMetrics {
    pub cpu_pct: u8,
    pub mem_used_kb: u64,
    pub mem_total_kb: u64,
    pub disk_used_kb: u64,
    pub disk_total_kb: u64,
    pub disk_pct: u8,
    pub load1: f64,
    pub cpus: u32,
}

pub async fn fetch_server_metrics(
    handle: Arc<Mutex<client::Handle<SshClientHandler>>>,
    channel_lane: Arc<Semaphore>,
) -> AxionResult<RemoteServerMetrics> {
    let _lane = channel_lane
        .acquire()
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;

    let script = include_str!("../../scripts/remote_metrics.sh")
        .trim()
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let payload = STANDARD.encode(script.as_bytes());
    let command = format!("echo {payload} | base64 -d | /bin/sh");

    let mut channel = {
        let session = handle.lock().await;
        if session.is_closed() {
            return Err(AxionError::from("SSH session is closed"));
        }
        session
            .channel_open_session()
            .await
            .map_err(|e| AxionError::from(e.to_string()))?
    };

    channel
        .exec(true, command)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;

    let mut stdout = CryptoVec::new();
    let mut stderr = CryptoVec::new();
    let mut exit_code = 0u32;
    let mut got_exit = false;

    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => stdout.extend(&data),
            Some(ChannelMsg::ExtendedData { data, ext }) if ext == 1 => stderr.extend(&data),
            Some(ChannelMsg::ExtendedData { data, .. }) => stdout.extend(&data),
            Some(ChannelMsg::ExitStatus { exit_status }) => {
                exit_code = exit_status;
                got_exit = true;
            }
            Some(ChannelMsg::Close) | None => break,
            Some(ChannelMsg::Eof) | Some(_) => {
                if got_exit {
                    break;
                }
            }
        }
    }

    let _ = channel.close().await;

    if exit_code != 0 {
        let err = String::from_utf8_lossy(&stderr).trim().to_string();
        return Err(AxionError::from(if err.is_empty() {
            format!("metrics script exited with {exit_code}")
        } else {
            err
        }));
    }

    let text = String::from_utf8_lossy(&stdout);
    let line = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .find(|l| l.starts_with('{') && l.contains("cpuPct"))
        .or_else(|| {
            text.lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .find(|l| l.starts_with('{'))
        })
        .ok_or_else(|| {
            let err_owned = String::from_utf8_lossy(&stderr).into_owned();
            let err = err_owned.trim();
            let snippet: String = text.chars().take(120).collect();
            AxionError::from(if err.is_empty() {
                "no metrics json in remote output (stdout was empty or unexpected)".to_string()
            } else {
                format!("no metrics json — remote said: {err} (stdout: {snippet})")
            })
        })?;

    serde_json::from_str(line).map_err(|e| AxionError::from(format!("invalid metrics json: {e}")))
}
