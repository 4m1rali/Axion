use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AxionError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Russh(#[from] russh::Error),
    #[error(transparent)]
    RusshKeys(#[from] russh_keys::Error),
    #[error("connection not found")]
    ConnectionNotFound,
    #[error("terminal not found")]
    TerminalNotFound,
    #[error("tunnel not found")]
    TunnelNotFound,
    #[error("transfer not found")]
    TransferNotFound,
    #[error("host key verification required")]
    HostKeyRequired,
    #[error("password required")]
    PasswordRequired,
    #[error("authentication failed")]
    AuthFailed,
    #[error("operation cancelled")]
    Cancelled,
}

impl Serialize for AxionError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AxionError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for AxionError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

pub type AxionResult<T> = Result<T, AxionError>;
