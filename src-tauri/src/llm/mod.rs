use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use crate::creds::get_llm_api_key;
use crate::error::{AxionError, AxionResult};

static CHAT_ABORT: Mutex<Option<watch::Sender<bool>>> = Mutex::new(None);

pub fn abort_chat() {
    if let Ok(guard) = CHAT_ABORT.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(true);
        }
    }
}

fn begin_chat_cancel() -> watch::Receiver<bool> {
    let (tx, rx) = watch::channel(false);
    if let Ok(mut guard) = CHAT_ABORT.lock() {
        *guard = Some(tx);
    }
    rx
}

fn end_chat_cancel() {
    if let Ok(mut guard) = CHAT_ABORT.lock() {
        *guard = None;
    }
}

async fn wait_chat_cancel(cancel: &mut watch::Receiver<bool>) {
    if *cancel.borrow() {
        return;
    }
    let _ = cancel.changed().await;
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelEntry>>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionResult {
    pub content: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Deserialize)]
struct UsageBlock {
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    total_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Option<Vec<ChatChoice>>,
    usage: Option<UsageBlock>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: Option<ChatMessage>,
}

fn normalize_base_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        trimmed.to_string()
    }
}

fn auth_header(api_key: &str) -> AxionResult<reqwest::header::HeaderValue> {
    reqwest::header::HeaderValue::from_str(&format!("Bearer {api_key}"))
        .map_err(|e| AxionError::from(e.to_string()))
}

pub async fn list_models(api_url: &str) -> AxionResult<Vec<String>> {
    let api_key = get_llm_api_key()?.ok_or_else(|| AxionError::from("LLM API key is not set"))?;
    let base = normalize_base_url(api_url);
    let url = format!("{base}/models");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| AxionError::from(e.to_string()))?;
    let mut req = client.get(&url);
    req = req.header(reqwest::header::AUTHORIZATION, auth_header(&api_key)?);
    let res = req
        .send()
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(AxionError::from(format!(
            "Models request failed ({status}): {}",
            body.chars().take(400).collect::<String>()
        )));
    }
    let parsed: ModelsResponse = res.json().await.map_err(|e| AxionError::from(e.to_string()))?;
    let mut ids: Vec<String> = parsed
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.id)
        .filter(|id| !id.is_empty())
        .collect();
    ids.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    ids.dedup();
    Ok(ids)
}

async fn chat_completion_inner(
    api_url: &str,
    model: &str,
    messages: Vec<ChatMessage>,
) -> AxionResult<ChatCompletionResult> {
    let api_key = get_llm_api_key()?.ok_or_else(|| AxionError::from("LLM API key is not set"))?;
    if model.trim().is_empty() {
        return Err(AxionError::from("No model selected"));
    }
    let base = normalize_base_url(api_url);
    let url = format!("{base}/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AxionError::from(e.to_string()))?;
    let body = ChatRequest {
        model: model.to_string(),
        messages,
        temperature: 0.2,
    };
    let res = client
        .post(&url)
        .header(reqwest::header::AUTHORIZATION, auth_header(&api_key)?)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AxionError::from(format!(
            "Chat request failed ({status}): {}",
            text.chars().take(500).collect::<String>()
        )));
    }
    let parsed: ChatResponse = res.json().await.map_err(|e| AxionError::from(e.to_string()))?;
    let content = parsed
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.message)
        .map(|m| m.content)
        .unwrap_or_default();
    if content.trim().is_empty() {
        return Err(AxionError::from("Model returned an empty response"));
    }
    let usage = parsed.usage.map(|u| TokenUsage {
        prompt_tokens: u.prompt_tokens,
        completion_tokens: u.completion_tokens,
        total_tokens: u.total_tokens,
    });
    Ok(ChatCompletionResult { content, usage })
}

pub async fn chat_completion(
    api_url: &str,
    model: &str,
    messages: Vec<ChatMessage>,
) -> AxionResult<ChatCompletionResult> {
    let mut cancel_rx = begin_chat_cancel();
    let api_url = api_url.to_string();
    let model = model.to_string();
    let result = tokio::select! {
        res = chat_completion_inner(&api_url, &model, messages) => res,
        () = wait_chat_cancel(&mut cancel_rx) => {
            Err(AxionError::from("operation cancelled"))
        }
    };
    end_chat_cancel();
    result
}
