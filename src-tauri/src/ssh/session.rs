use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use dashmap::DashMap;
use russh::client;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex, Semaphore};
use uuid::Uuid;

use super::diagnostics::{DiagnosticPhase, Diagnostics};
use super::handler::{create_gate, resolve_gate, HostKeyGate, SshClientHandler};
use super::jump::{connect_via_jumps, parse_proxy_jump};
use super::proxy;
use super::types::{ConnectOutcome, ConnectRequest, ConnectionSummary};
use crate::creds::{get_password, set_password};
use crate::error::{AxionError, AxionResult};
use crate::keys::key_for_auth;
use crate::persist::profiles::touch_last_connected;
use crate::persist::settings::load_settings;
use crate::terminal::TerminalRuntime;
use crate::tunnel::TunnelRuntime;

pub struct LiveConnection {
    pub id: Uuid,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub handle: Arc<Mutex<client::Handle<SshClientHandler>>>,
    /// Serializes opening exec / subsystem / extra session channels on one SSH link.
    pub channel_lane: Arc<Semaphore>,
    pub connected_at: chrono::DateTime<Utc>,
}

#[derive(Clone)]
pub struct SessionManager {
    inner: Arc<SessionManagerInner>,
}

struct SessionManagerInner {
    connections: DashMap<Uuid, LiveConnection>,
    pending: DashMap<String, HostKeyGate>,
    terminals: TerminalRuntime,
    tunnels: TunnelRuntime,
    app: AppHandle,
}

impl SessionManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            inner: Arc::new(SessionManagerInner {
                connections: DashMap::new(),
                pending: DashMap::new(),
                terminals: TerminalRuntime::new(),
                tunnels: TunnelRuntime::new(),
                app,
            }),
        }
    }

    pub fn terminals(&self) -> TerminalRuntime {
        self.inner.terminals.clone()
    }

    pub fn tunnels(&self) -> TunnelRuntime {
        self.inner.tunnels.clone()
    }

    pub async fn connect(&self, request: ConnectRequest) -> AxionResult<ConnectOutcome> {
        let settings = load_settings()?;
        let host = request.host.trim().to_string();
        let port = if request.port == 0 {
            settings.default_ssh_port
        } else {
            request.port
        };
        let trace_id = Uuid::new_v4().to_string();
        let diagnostics = Diagnostics::new(Some(self.inner.app.clone()), trace_id);
        diagnostics.info(DiagnosticPhase::Dns, format!("resolving target {host}"));
        diagnostics.info(DiagnosticPhase::Tcp, format!("starting connection to {host}:{port}"));
        let (handler, gate) = create_gate(host.clone(), port);
        let pending_id = Uuid::new_v4().to_string();
        self.inner.pending.insert(pending_id.clone(), gate.clone());
        let (result_tx, mut result_rx) = oneshot::channel();
        let manager = self.clone();
        let request_clone = request.clone();
        let pending_done = pending_id.clone();
        let diagnostics_bg = diagnostics.clone();
        tokio::spawn(async move {
            let outcome = manager
                .run_connect(handler, request_clone, settings, diagnostics_bg, host, port)
                .await;
            let _ = result_tx.send(outcome.map(|id| id.to_string()));
            manager.inner.pending.remove(&pending_done);
        });
        for _ in 0..80 {
            if let Some(prompt) = gate.pending_prompt.lock().await.clone() {
                diagnostics.info(DiagnosticPhase::HostKey, "waiting for host key verification");
                return Ok(ConnectOutcome::HostKeyRequired { pending_id, prompt });
            }
            if let Ok(result) = result_rx.try_recv() {
                return match result {
                    Ok(id) => Ok(ConnectOutcome::Connected { connection_id: id }),
                    Err(error) => Err(error),
                };
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        match tokio::time::timeout(Duration::from_secs(90), result_rx).await {
            Ok(Ok(Ok(id))) => Ok(ConnectOutcome::Connected { connection_id: id }),
            Ok(Ok(Err(error))) => Err(error),
            Ok(Err(_)) => Err(AxionError::from("connection cancelled")),
            Err(_) => Err(AxionError::from(Diagnostics::timeout_message(Duration::from_secs(90)))),
        }
    }

    async fn run_connect(
        &self,
        handler: SshClientHandler,
        request: ConnectRequest,
        settings: crate::persist::settings::AppSettings,
        diagnostics: Diagnostics,
        host: String,
        port: u16,
    ) -> AxionResult<Uuid> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_millis(settings.connection_timeout_ms)),
            keepalive_interval: Some(Duration::from_secs(settings.keepalive_interval_secs)),
            ..Default::default()
        });
        let mut jump_chain = request.jump_chain.clone();
        if jump_chain.is_empty() {
            if let Some(proxy) = &request.proxy_jump {
                jump_chain = parse_proxy_jump(proxy, &request.username);
            }
        }
        let transport_proxy = request.transport_proxy.as_ref();
        if transport_proxy.filter(|p| p.is_active()).is_some() {
            let kind = transport_proxy
                .and_then(|p| p.proxy_type.as_deref())
                .unwrap_or("proxy");
            diagnostics.info(
                DiagnosticPhase::Tcp,
                format!("routing via {kind} proxy before ssh"),
            );
        }
        if jump_chain.is_empty() {
            diagnostics.info(DiagnosticPhase::Tcp, "direct tcp connection");
        } else {
            diagnostics.warning(
                DiagnosticPhase::Tcp,
                format!("jump chain with {} hop(s)", jump_chain.len()),
            );
        }
        let mut session = if jump_chain.is_empty() {
            proxy::ssh_connect(config.clone(), handler, &host, port, transport_proxy)
                .await
                .map_err(|e| {
                    diagnostics.error(
                        DiagnosticPhase::Tcp,
                        "tcp or ssh handshake failed",
                        Some(e.to_string()),
                    );
                    e
                })?
        } else {
            connect_via_jumps(
                config.clone(),
                &jump_chain,
                &host,
                port,
                handler,
                transport_proxy,
            )
            .await
            .map_err(|e| {
                diagnostics.error(
                    DiagnosticPhase::Tcp,
                    "jump chain failed",
                    Some(e.to_string()),
                );
                e
            })?
        };
        diagnostics.info(DiagnosticPhase::Kex, "key exchange completed");
        let mut password = request.password.clone();
        if password.is_none() {
            if let Some(profile_id) = &request.profile_id {
                password = get_password(profile_id)?;
            }
        }
        diagnostics.info(DiagnosticPhase::Authentication, "attempting authentication");
        let authed = match request.auth_method.as_str() {
            "password" => {
                let pwd = password.clone().ok_or_else(|| {
                    diagnostics.error(
                        DiagnosticPhase::Authentication,
                        "missing password",
                        None,
                    );
                    AxionError::PasswordRequired
                })?;
                session
                    .authenticate_password(&request.username, &pwd)
                    .await
                    .map_err(|e| {
                        diagnostics.error(
                            DiagnosticPhase::Authentication,
                            "password auth transport error",
                            Some(e.to_string()),
                        );
                        AxionError::from(e.to_string())
                    })?
            }
            "publicKey" | "public_key" => {
                let key_id = request.key_ref.as_ref().ok_or(AxionError::AuthFailed)?;
                let key = key_for_auth(key_id)?;
                session
                    .authenticate_publickey(&request.username, key)
                    .await
                    .map_err(|e| AxionError::from(e.to_string()))?
            }
            _ => {
                diagnostics.error(DiagnosticPhase::Authentication, "unknown auth method", None);
                return Err(AxionError::AuthFailed);
            }
        };
        if !authed.success() {
            diagnostics.error(DiagnosticPhase::Authentication, "authentication rejected", None);
            return Err(AxionError::AuthFailed);
        }
        diagnostics.success(DiagnosticPhase::Established, "session established");
        let stored_password = password.clone();
        if request.remember_password {
            if let (Some(profile_id), Some(pwd)) = (&request.profile_id, &stored_password) {
                let _ = set_password(profile_id, pwd);
            }
        }
        if let Some(profile_id) = &request.profile_id {
            let _ = touch_last_connected(profile_id);
        }
        let id = Uuid::new_v4();
        let live = LiveConnection {
            id,
            host: host.clone(),
            port,
            username: request.username.clone(),
            handle: Arc::new(Mutex::new(session)),
            channel_lane: Arc::new(Semaphore::new(8)),
            connected_at: Utc::now(),
        };
        self.inner.connections.insert(id, live);
        let summary = ConnectionSummary {
            id: id.to_string(),
            host,
            port,
            username: request.username,
            connected_at: Utc::now().to_rfc3339(),
        };
        let _ = self.inner.app.emit("connection://status", summary);
        Ok(id)
    }

    pub async fn resolve_host_key(&self, pending_id: &str, accept: bool) -> AxionResult<()> {
        let gate = self
            .inner
            .pending
            .get(pending_id)
            .ok_or(AxionError::HostKeyRequired)?;
        resolve_gate(&gate, accept).await?;
        if !accept {
            return Err(AxionError::from("host key rejected"));
        }
        Ok(())
    }

    pub fn list_connections(&self) -> Vec<ConnectionSummary> {
        let mut stale = Vec::new();
        let mut live = Vec::new();
        for entry in self.inner.connections.iter() {
            let conn = entry.value();
            let closed = conn.handle.try_lock().map(|h| h.is_closed()).unwrap_or(true);
            if closed {
                stale.push(*entry.key());
                continue;
            }
            live.push(ConnectionSummary {
                id: conn.id.to_string(),
                host: conn.host.clone(),
                port: conn.port,
                username: conn.username.clone(),
                connected_at: conn.connected_at.to_rfc3339(),
            });
        }
        for id in stale {
            self.inner.connections.remove(&id);
        }
        live
    }

    pub async fn disconnect(&self, connection_id: &str) -> AxionResult<()> {
        let id = Uuid::parse_str(connection_id).map_err(|_| AxionError::ConnectionNotFound)?;
        self.inner.tunnels.stop_for_connection(connection_id).await;
        self.inner.terminals.close_all_for(connection_id).await;
        self.inner.connections.remove(&id);
        Ok(())
    }

    pub fn handle_arc(
        &self,
        connection_id: &str,
    ) -> AxionResult<Arc<Mutex<client::Handle<SshClientHandler>>>> {
        let id = Uuid::parse_str(connection_id).map_err(|_| AxionError::ConnectionNotFound)?;
        let slot = self
            .inner
            .connections
            .get(&id)
            .ok_or(AxionError::ConnectionNotFound)?;
        Ok(slot.handle.clone())
    }

    pub fn channel_lane(&self, connection_id: &str) -> AxionResult<Arc<Semaphore>> {
        let id = Uuid::parse_str(connection_id).map_err(|_| AxionError::ConnectionNotFound)?;
        let slot = self
            .inner
            .connections
            .get(&id)
            .ok_or(AxionError::ConnectionNotFound)?;
        Ok(slot.channel_lane.clone())
    }

    pub async fn ensure_handle_alive(&self, connection_id: &str) -> AxionResult<()> {
        let handle = self.handle_arc(connection_id)?;
        let session = handle.lock().await;
        if session.is_closed() {
            drop(session);
            if let Ok(id) = Uuid::parse_str(connection_id) {
                self.inner.connections.remove(&id);
            }
            return Err(AxionError::from("SSH session is closed — reconnect"));
        }
        Ok(())
    }
}
