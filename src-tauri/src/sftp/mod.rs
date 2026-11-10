use std::sync::Arc;

use dashmap::DashMap;
use russh::client;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileType, OpenFlags};
use serde::Serialize;
use tauri::ipc::Channel;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{Semaphore as AsyncSemaphore, Semaphore};
use uuid::Uuid;

use crate::error::{AxionError, AxionResult};
use crate::persist::settings::load_settings;
use crate::ssh::channel_util::wait_channel_request;
use crate::ssh::handler::SshClientHandler;

#[derive(Clone)]
pub struct SftpEngine {
    sessions: Arc<DashMap<String, SftpSession>>,
    transfers: Arc<DashMap<String, tokio::sync::watch::Sender<bool>>>,
    semaphore: Arc<Semaphore>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub transfer_id: String,
    pub transferred: u64,
    pub total: Option<u64>,
    pub done: bool,
    pub error: Option<String>,
}

impl SftpEngine {
    pub fn new() -> Self {
        let settings = load_settings().unwrap_or_default();
        Self {
            sessions: Arc::new(DashMap::new()),
            transfers: Arc::new(DashMap::new()),
            semaphore: Arc::new(Semaphore::new(settings.max_concurrent_transfers.max(1))),
        }
    }

    pub async fn connect_sftp(
        handle: Arc<tokio::sync::Mutex<client::Handle<SshClientHandler>>>,
        channel_lane: Arc<AsyncSemaphore>,
    ) -> AxionResult<SftpSession> {
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
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        wait_channel_request(&mut channel).await?;
        let stream = channel.into_stream();
        SftpSession::new(stream)
            .await
            .map_err(|e| AxionError::from(e.to_string()))
    }

    pub fn has_session(&self, connection_id: &str) -> bool {
        self.sessions.contains_key(connection_id)
    }

    pub fn remove_session(&self, connection_id: &str) {
        self.sessions.remove(connection_id);
    }

    pub fn install_session(&self, connection_id: &str, sftp: SftpSession) {
        self.sessions.remove(connection_id);
        self.sessions.insert(connection_id.to_string(), sftp);
    }

    pub async fn attach(
        &self,
        connection_id: &str,
        handle: Arc<tokio::sync::Mutex<client::Handle<SshClientHandler>>>,
        channel_lane: Arc<AsyncSemaphore>,
    ) -> AxionResult<()> {
        let sftp = Self::connect_sftp(handle, channel_lane).await?;
        self.install_session(connection_id, sftp);
        Ok(())
    }

    pub async fn list_remote(&self, connection_id: &str, path: &str) -> AxionResult<Vec<FileEntry>> {
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        let list = sftp
            .read_dir(path)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let mut entries = Vec::new();
        for entry in list {
            let meta = entry.metadata();
            let name = entry.file_name();
            entries.push(FileEntry {
                name: name.clone(),
                path: entry.path(),
                is_dir: matches!(entry.file_type(), FileType::Dir),
                size: meta.size.unwrap_or(0),
                modified: meta.mtime.map(|v| v as i64),
            });
        }
        Ok(entries)
    }

    pub async fn list_local(&self, path: &str) -> AxionResult<Vec<FileEntry>> {
        let path = if path.is_empty() {
            dirs::home_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "C:\\".to_string())
        } else {
            path.to_string()
        };
        let mut read_dir = tokio::fs::read_dir(&path).await?;
        let mut entries = Vec::new();
        while let Some(entry) = read_dir.next_entry().await? {
            let meta = entry.metadata().await?;
            let name = entry.file_name().to_string_lossy().to_string();
            let full = entry.path().display().to_string();
            entries.push(FileEntry {
                name,
                path: full,
                is_dir: meta.is_dir(),
                size: meta.len(),
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64),
            });
        }
        Ok(entries)
    }

    pub async fn upload(
        &self,
        connection_id: &str,
        local_path: String,
        remote_path: String,
        progress: Channel<TransferProgress>,
    ) -> AxionResult<String> {
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let transfer_id = Uuid::new_v4().to_string();
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        self.transfers.insert(transfer_id.clone(), cancel_tx);
        let settings = load_settings()?;
        let buffer_size = settings.transfer_buffer_size.max(4096);
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        let meta = tokio::fs::metadata(&local_path).await?;
        let total = meta.len();
        let mut local = File::open(&local_path).await?;
        let mut remote = sftp
            .create(&remote_path)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let mut transferred = 0u64;
        let mut buffer = vec![0u8; buffer_size];
        loop {
            if *cancel_rx.borrow() {
                self.transfers.remove(&transfer_id);
                return Err(AxionError::Cancelled);
            }
            let n = local.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            remote
                .write_all(&buffer[..n])
                .await
                .map_err(|e| AxionError::from(e.to_string()))?;
            transferred += n as u64;
            let _ = progress.send(TransferProgress {
                transfer_id: transfer_id.clone(),
                transferred,
                total: Some(total),
                done: false,
                error: None,
            });
        }
        let _ = progress.send(TransferProgress {
            transfer_id: transfer_id.clone(),
            transferred,
            total: Some(total),
            done: true,
            error: None,
        });
        self.transfers.remove(&transfer_id);
        Ok(transfer_id)
    }

    pub async fn download(
        &self,
        connection_id: &str,
        remote_path: String,
        local_path: String,
        progress: Channel<TransferProgress>,
    ) -> AxionResult<String> {
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let transfer_id = Uuid::new_v4().to_string();
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        self.transfers.insert(transfer_id.clone(), cancel_tx);
        let settings = load_settings()?;
        let buffer_size = settings.transfer_buffer_size.max(4096);
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        let total = sftp
            .metadata(&remote_path)
            .await
            .ok()
            .and_then(|m| m.size);
        let mut remote = sftp
            .open(&remote_path)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let mut local = File::create(&local_path).await?;
        let mut transferred = 0u64;
        let mut buffer = vec![0u8; buffer_size];
        loop {
            if *cancel_rx.borrow() {
                self.transfers.remove(&transfer_id);
                return Err(AxionError::Cancelled);
            }
            let n = remote
                .read(&mut buffer)
                .await
                .map_err(|e| AxionError::from(e.to_string()))?;
            if n == 0 {
                break;
            }
            local.write_all(&buffer[..n]).await?;
            transferred += n as u64;
            let _ = progress.send(TransferProgress {
                transfer_id: transfer_id.clone(),
                transferred,
                total,
                done: false,
                error: None,
            });
        }
        let _ = progress.send(TransferProgress {
            transfer_id: transfer_id.clone(),
            transferred,
            total: Some(transferred),
            done: true,
            error: None,
        });
        self.transfers.remove(&transfer_id);
        Ok(transfer_id)
    }

    pub fn cancel_transfer(&self, transfer_id: &str) -> AxionResult<()> {
        if let Some(tx) = self.transfers.get(transfer_id) {
            let _ = tx.send(true);
            Ok(())
        } else {
            Err(AxionError::TransferNotFound)
        }
    }

    pub async fn mkdir_remote(&self, connection_id: &str, path: &str) -> AxionResult<()> {
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        sftp.create_dir(path)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        Ok(())
    }

    pub async fn delete_remote(&self, connection_id: &str, path: &str, is_dir: bool) -> AxionResult<()> {
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        if is_dir {
            sftp.remove_dir(path)
                .await
                .map_err(|e| AxionError::from(e.to_string()))?;
        } else {
            sftp.remove_file(path)
                .await
                .map_err(|e| AxionError::from(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn create_remote_file(&self, connection_id: &str, path: &str) -> AxionResult<()> {
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        let mut file = sftp
            .open_with_flags(path, OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        file.shutdown()
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        Ok(())
    }

    pub async fn mkdir_local(&self, path: &str) -> AxionResult<()> {
        tokio::fs::create_dir_all(path).await?;
        Ok(())
    }

    pub async fn create_local_file(&self, path: &str) -> AxionResult<()> {
        tokio::fs::write(path, []).await?;
        Ok(())
    }

    pub async fn delete_local(&self, path: &str, is_dir: bool) -> AxionResult<()> {
        if is_dir {
            tokio::fs::remove_dir_all(path).await?;
        } else {
            tokio::fs::remove_file(path).await?;
        }
        Ok(())
    }

    pub async fn rename_local(&self, from: &str, to: &str) -> AxionResult<()> {
        tokio::fs::rename(from, to).await?;
        Ok(())
    }

    pub async fn rename_remote(&self, connection_id: &str, from: &str, to: &str) -> AxionResult<()> {
        let sftp = self
            .sessions
            .get(connection_id)
            .ok_or(AxionError::ConnectionNotFound)?;
        sftp.rename(from, to)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        Ok(())
    }
}
