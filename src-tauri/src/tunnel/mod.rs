use std::net::SocketAddr;
use std::sync::Arc;

use dashmap::DashMap;
use russh::client;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AxionError, AxionResult};
use crate::ssh::handler::SshClientHandler;

type SharedHandle = Arc<Mutex<client::Handle<SshClientHandler>>>;

#[derive(Clone)]
pub struct TunnelRuntime {
    inner: Arc<TunnelRuntimeInner>,
}

struct TunnelRuntimeInner {
    active: DashMap<String, TunnelHandle>,
}

struct TunnelHandle {
    connection_id: String,
    abort: tokio::sync::watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTunnel {
    pub id: String,
    pub connection_id: String,
    pub kind: String,
    pub bind: String,
    pub running: bool,
    pub error: Option<String>,
}

impl TunnelRuntime {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(TunnelRuntimeInner {
                active: DashMap::new(),
            }),
        }
    }

    pub fn list(&self) -> Vec<ActiveTunnel> {
        self.inner
            .active
            .iter()
            .map(|e| ActiveTunnel {
                id: e.key().clone(),
                connection_id: e.value().connection_id.clone(),
                kind: "local".to_string(),
                bind: String::new(),
                running: !e.value().task.is_finished(),
                error: None,
            })
            .collect()
    }

    pub async fn start_local(
        &self,
        connection_id: &str,
        handle: Arc<Mutex<client::Handle<SshClientHandler>>>,
        local_address: &str,
        local_port: u16,
        destination_host: &str,
        destination_port: u16,
        acknowledge_public: bool,
    ) -> AxionResult<String> {
        if local_address == "0.0.0.0" && !acknowledge_public {
            return Err(AxionError::from("public bind requires acknowledgement"));
        }
        let bind: SocketAddr = format!("{local_address}:{local_port}")
            .parse::<SocketAddr>()
            .map_err(|e: std::net::AddrParseError| AxionError::from(e.to_string()))?;
        let listener = TcpListener::bind(bind)
            .await
            .map_err(|e: std::io::Error| AxionError::from(e.to_string()))?;
        let id = Uuid::new_v4().to_string();
        let (abort_tx, mut abort_rx) = tokio::sync::watch::channel(false);
        let destination_host = destination_host.to_string();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = abort_rx.changed() => break,
                    accept = listener.accept() => {
                        let Ok((stream, peer)) = accept else { break };
                        let handle = handle.clone();
                        let destination_host = destination_host.clone();
                        tokio::spawn(async move {
                            let _ = relay_local(handle, stream, peer, destination_host, destination_port).await;
                        });
                    }
                }
            }
        });
        self.inner.active.insert(
            id.clone(),
            TunnelHandle {
                connection_id: connection_id.to_string(),
                abort: abort_tx,
                task,
            },
        );
        Ok(id)
    }

    pub async fn start_dynamic(
        &self,
        connection_id: &str,
        handle: Arc<Mutex<client::Handle<SshClientHandler>>>,
        local_address: &str,
        local_port: u16,
        acknowledge_public: bool,
    ) -> AxionResult<String> {
        if local_address == "0.0.0.0" && !acknowledge_public {
            return Err(AxionError::from("public bind requires acknowledgement"));
        }
        let bind: SocketAddr = format!("{local_address}:{local_port}")
            .parse::<SocketAddr>()
            .map_err(|e: std::net::AddrParseError| AxionError::from(e.to_string()))?;
        let listener = TcpListener::bind(bind)
            .await
            .map_err(|e: std::io::Error| AxionError::from(e.to_string()))?;
        let id = Uuid::new_v4().to_string();
        let (abort_tx, mut abort_rx) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = abort_rx.changed() => break,
                    accept = listener.accept() => {
                        let Ok((stream, peer)) = accept else { break };
                        let handle = handle.clone();
                        tokio::spawn(async move {
                            let _ = serve_socks5(handle, stream, peer).await;
                        });
                    }
                }
            }
        });
        self.inner.active.insert(
            id.clone(),
            TunnelHandle {
                connection_id: connection_id.to_string(),
                abort: abort_tx,
                task,
            },
        );
        Ok(id)
    }

    pub async fn stop(&self, tunnel_id: &str) -> AxionResult<()> {
        if let Some((_, handle)) = self.inner.active.remove(tunnel_id) {
            let _ = handle.abort.send(true);
            handle.task.abort();
        }
        Ok(())
    }

    pub async fn stop_for_connection(&self, connection_id: &str) {
        let ids: Vec<String> = self
            .inner
            .active
            .iter()
            .filter(|e| e.value().connection_id == connection_id)
            .map(|e| e.key().clone())
            .collect();
        for id in ids {
            let _ = self.stop(&id).await;
        }
    }
}

async fn relay_local(
    handle: SharedHandle,
    mut inbound: TcpStream,
    peer: SocketAddr,
    destination_host: String,
    destination_port: u16,
) -> AxionResult<()> {
    let guard = handle.lock().await;
    let channel = guard
        .channel_open_direct_tcpip(
            destination_host,
            destination_port as u32,
            peer.ip().to_string(),
            peer.port() as u32,
        )
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    drop(guard);
    let mut remote = channel.into_stream();
    let _ = tokio::io::copy_bidirectional(&mut inbound, &mut remote).await;
    Ok(())
}

async fn serve_socks5(handle: SharedHandle, inbound: TcpStream, peer: SocketAddr) -> std::io::Result<()> {
    let mut inbound = inbound;
    let mut head = [0u8; 2];
    inbound.read_exact(&mut head).await?;
    if head[0] != 0x05 {
        return Ok(());
    }
    let mut methods = vec![0u8; head[1] as usize];
    inbound.read_exact(&mut methods).await?;
    inbound.write_all(&[0x05, 0x00]).await?;
    let mut req = [0u8; 4];
    inbound.read_exact(&mut req).await?;
    if req[1] != 0x01 {
        let _ = inbound
            .write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            .await;
        return Ok(());
    }
    let host = match req[3] {
        0x01 => {
            let mut a = [0u8; 4];
            inbound.read_exact(&mut a).await?;
            std::net::Ipv4Addr::from(a).to_string()
        }
        0x03 => {
            let mut len = [0u8; 1];
            inbound.read_exact(&mut len).await?;
            let mut d = vec![0u8; len[0] as usize];
            inbound.read_exact(&mut d).await?;
            String::from_utf8_lossy(&d).into_owned()
        }
        _ => return Ok(()),
    };
    let mut port = [0u8; 2];
    inbound.read_exact(&mut port).await?;
    let port = u16::from_be_bytes(port);
    let guard = handle.lock().await;
    let channel = guard
        .channel_open_direct_tcpip(host, port as u32, peer.ip().to_string(), peer.port() as u32)
        .await;
    drop(guard);
    match channel {
        Ok(ch) => {
            inbound
                .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await?;
            let mut remote = ch.into_stream();
            let _ = tokio::io::copy_bidirectional(&mut inbound, &mut remote).await;
        }
        Err(_) => {
            let _ = inbound
                .write_all(&[0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await;
        }
    }
    Ok(())
}
