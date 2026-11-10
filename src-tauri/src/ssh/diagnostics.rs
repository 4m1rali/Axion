use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticPhase {
    Dns,
    Tcp,
    Kex,
    HostKey,
    Authentication,
    Established,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticLevel {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticStep {
    pub phase: DiagnosticPhase,
    pub level: DiagnosticLevel,
    pub message: String,
    pub elapsed_ms: u64,
    pub detail: Option<String>,
}

#[derive(Clone)]
pub struct Diagnostics {
    app: Option<AppHandle>,
    trace_id: String,
    started: Instant,
}

impl Diagnostics {
    pub fn new(app: Option<AppHandle>, trace_id: String) -> Self {
        Self {
            app,
            trace_id,
            started: Instant::now(),
        }
    }

    pub fn emit(
        &self,
        phase: DiagnosticPhase,
        level: DiagnosticLevel,
        message: impl Into<String>,
        detail: Option<String>,
    ) {
        let step = DiagnosticStep {
            phase,
            level,
            message: message.into(),
            elapsed_ms: self.started.elapsed().as_millis() as u64,
            detail,
        };
        if let Some(app) = &self.app {
            let _ = app.emit(
                "ssh://diagnostics",
                serde_json::json!({
                    "traceId": self.trace_id,
                    "step": step,
                }),
            );
        }
    }

    pub fn info(&self, phase: DiagnosticPhase, message: impl Into<String>) {
        self.emit(phase, DiagnosticLevel::Info, message, None);
    }

    pub fn success(&self, phase: DiagnosticPhase, message: impl Into<String>) {
        self.emit(phase, DiagnosticLevel::Success, message, None);
    }

    pub fn warning(&self, phase: DiagnosticPhase, message: impl Into<String>) {
        self.emit(phase, DiagnosticLevel::Warning, message, None);
    }

    pub fn error(&self, phase: DiagnosticPhase, message: impl Into<String>, detail: Option<String>) {
        self.emit(phase, DiagnosticLevel::Error, message, detail);
    }

    pub fn timeout_message(timeout: Duration) -> String {
        format!("timed out after {} ms", timeout.as_millis())
    }
}
