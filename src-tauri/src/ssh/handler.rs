use std::sync::Arc;

use russh::client;
use russh::keys::PublicKey;
use tokio::sync::oneshot;

use crate::error::AxionResult;
use crate::persist::known_hosts::{evaluate, trust_host, TrustState};

#[derive(Clone)]
pub struct HostKeyGate {
    pub host: String,
    pub port: u16,
    pub pending_prompt: Arc<tokio::sync::Mutex<Option<crate::persist::known_hosts::HostKeyInfo>>>,
    pub decision_tx: Arc<tokio::sync::Mutex<Option<oneshot::Sender<bool>>>>,
}

pub struct SshClientHandler {
    pub gate: HostKeyGate,
}

impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let info = evaluate(&self.gate.host, self.gate.port, server_public_key)
            .map_err(|_| russh::Error::Inconsistent)?;
        if matches!(info.trust_state, TrustState::Known) {
            return Ok(true);
        }
        let (tx, rx) = oneshot::channel();
        {
            let mut prompt = self.gate.pending_prompt.lock().await;
            *prompt = Some(info);
        }
        {
            let mut slot = self.gate.decision_tx.lock().await;
            *slot = Some(tx);
        }
        let accepted = match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(value)) => value,
            _ => false,
        };
        if accepted {
            trust_host(&self.gate.host, self.gate.port, server_public_key)
                .map_err(|_| russh::Error::Inconsistent)?;
            return Ok(true);
        }
        Ok(false)
    }
}

pub fn create_gate(host: String, port: u16) -> (SshClientHandler, HostKeyGate) {
    let gate = HostKeyGate {
        host: host.clone(),
        port,
        pending_prompt: Arc::new(tokio::sync::Mutex::new(None)),
        decision_tx: Arc::new(tokio::sync::Mutex::new(None)),
    };
    let handler = SshClientHandler {
        gate: gate.clone(),
    };
    (handler, gate)
}

pub async fn resolve_gate(gate: &HostKeyGate, accept: bool) -> AxionResult<()> {
    let mut slot = gate.decision_tx.lock().await;
    if let Some(tx) = slot.take() {
        let _ = tx.send(accept);
    }
    Ok(())
}
