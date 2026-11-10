use std::sync::Arc;

use dashmap::DashMap;
use russh::client;
use russh::{Channel as SshChannel, ChannelMsg};
use tauri::ipc::{Channel as IpcChannel, InvokeResponseBody};
use tokio::sync::mpsc;
use tokio::sync::{Mutex, Semaphore};
use uuid::Uuid;

use crate::error::{AxionError, AxionResult};
use crate::ssh::handler::SshClientHandler;

#[derive(Clone)]
pub struct TerminalRuntime {
    inner: Arc<TerminalRuntimeInner>,
}

struct TerminalRuntimeInner {
    sessions: DashMap<Uuid, TerminalControl>,
}

struct TerminalControl {
    connection_id: String,
    input_tx: mpsc::Sender<Vec<u8>>,
    resize_tx: mpsc::Sender<(u32, u32)>,
    abort: tokio::sync::watch::Sender<bool>,
}

impl TerminalRuntime {
    async fn wait_channel_ready(channel: &mut SshChannel<client::Msg>) -> AxionResult<()> {
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Success) => return Ok(()),
                Some(ChannelMsg::Failure) => {
                    return Err(AxionError::from("remote rejected channel request"));
                }
                Some(_) => continue,
                None => return Err(AxionError::from("channel closed before ready")),
            }
        }
    }

    pub fn new() -> Self {
        Self {
            inner: Arc::new(TerminalRuntimeInner {
                sessions: DashMap::new(),
            }),
        }
    }

    pub async fn open(
        &self,
        connection_id: &str,
        handle: Arc<Mutex<client::Handle<SshClientHandler>>>,
        channel_lane: Arc<Semaphore>,
        cols: u32,
        rows: u32,
        output: IpcChannel<InvokeResponseBody>,
    ) -> AxionResult<String> {
        let _lane = channel_lane
            .acquire()
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;

        let mut channel = {
            let session = handle.lock().await;
            if session.is_closed() {
                return Err(AxionError::from("SSH session is closed — reconnect"));
            }
            session
                .channel_open_session()
                .await
                .map_err(|e| AxionError::from(e.to_string()))?
        };
        channel
            .request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        Self::wait_channel_ready(&mut channel).await?;
        channel
            .request_shell(true)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        Self::wait_channel_ready(&mut channel).await?;

        let term_id = Uuid::new_v4();
        let (input_tx, input_rx) = mpsc::channel::<Vec<u8>>(64);
        let (resize_tx, resize_rx) = mpsc::channel::<(u32, u32)>(8);
        let (abort_tx, abort_rx) = tokio::sync::watch::channel(false);

        tokio::spawn(async move {
            run_terminal_loop(channel, output, input_rx, resize_rx, abort_rx).await;
        });

        self.inner.sessions.insert(
            term_id,
            TerminalControl {
                connection_id: connection_id.to_string(),
                input_tx,
                resize_tx,
                abort: abort_tx,
            },
        );

        Ok(term_id.to_string())
    }

    pub async fn send_input(&self, terminal_id: &str, data: Vec<u8>) -> AxionResult<()> {
        let id = Uuid::parse_str(terminal_id).map_err(|_| AxionError::TerminalNotFound)?;
        let slot = self
            .inner
            .sessions
            .get(&id)
            .ok_or(AxionError::TerminalNotFound)?;
        slot.input_tx
            .send(data)
            .await
            .map_err(|_| AxionError::TerminalNotFound)
    }

    pub async fn resize(&self, terminal_id: &str, cols: u32, rows: u32) -> AxionResult<()> {
        let id = Uuid::parse_str(terminal_id).map_err(|_| AxionError::TerminalNotFound)?;
        let slot = self
            .inner
            .sessions
            .get(&id)
            .ok_or(AxionError::TerminalNotFound)?;
        slot.resize_tx
            .send((cols, rows))
            .await
            .map_err(|_| AxionError::TerminalNotFound)
    }

    pub async fn close(&self, terminal_id: &str) -> AxionResult<()> {
        let id = Uuid::parse_str(terminal_id).map_err(|_| AxionError::TerminalNotFound)?;
        if let Some((_, slot)) = self.inner.sessions.remove(&id) {
            let _ = slot.abort.send(true);
        }
        Ok(())
    }

    pub async fn close_all_for(&self, connection_id: &str) {
        let mut remove = Vec::new();
        for entry in self.inner.sessions.iter() {
            if entry.value().connection_id == connection_id {
                remove.push(*entry.key());
            }
        }
        for id in remove {
            let _ = self.close(&id.to_string()).await;
        }
    }
}

async fn run_terminal_loop(
    channel: SshChannel<client::Msg>,
    output: IpcChannel<InvokeResponseBody>,
    mut input_rx: mpsc::Receiver<Vec<u8>>,
    mut resize_rx: mpsc::Receiver<(u32, u32)>,
    mut abort: tokio::sync::watch::Receiver<bool>,
) {
    let (mut read_half, write_half) = channel.split();
    loop {
        if *abort.borrow() {
            break;
        }
        tokio::select! {
            biased;
            _ = abort.changed() => break,
            Some(data) = input_rx.recv() => {
                if data.is_empty() {
                    continue;
                }
                if write_half.data(&data[..]).await.is_err() {
                    break;
                }
            }
            Some((cols, rows)) = resize_rx.recv() => {
                let _ = write_half.window_change(cols, rows, 0, 0).await;
            }
            msg = read_half.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                        if !data.is_empty() {
                            let _ = output.send(InvokeResponseBody::Raw(data.to_vec()));
                        }
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                    _ => {}
                }
            }
        }
    }
    let _ = write_half.eof().await;
    let _ = write_half.close().await;
}
