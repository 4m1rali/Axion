use std::sync::Arc;

use tokio::sync::Mutex;

use crate::sftp::SftpEngine;
use crate::ssh::session::SessionManager;

pub struct AppState {
    pub sessions: SessionManager,
    pub sftp: Mutex<SftpEngine>,
}

impl AppState {
    pub fn new(sessions: SessionManager) -> Self {
        Self {
            sessions,
            sftp: Mutex::new(SftpEngine::new()),
        }
    }
}

pub type SharedState = Arc<AppState>;
