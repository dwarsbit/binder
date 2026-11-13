//! The assistant's way to its model: an OpenAI-compatible chat API at a
//! provider or on this computer. The desktop app asks from here, since
//! most providers don't answer a web page, and the key stays here: it
//! is kept in the system's credential store and only sent to the
//! provider it belongs to.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::oneshot;

/// A model on a laptop can take minutes over a long source.
const TIMEOUT: Duration = Duration::from_secs(600);

/// The key travels in a header: only HTTPS may carry it, except to a
/// model on this computer (Ollama, LM Studio, llama.cpp).
pub fn check_base_url(base_url: &str) -> Result<reqwest::Url, String> {
    let err = || {
        "The assistant's address must start with https://. Plain http only works for a model on this computer."
            .to_string()
    };
    let url = reqwest::Url::parse(base_url.trim()).map_err(|_| err())?;
    // `http://localhost@evil.example` has evil.example as its host, and a
    // credential never rides in the address.
    if !url.username().is_empty() || url.password().is_some() {
        return Err(err());
    }
    let host = url.host_str().unwrap_or("");
    let ok = match url.scheme() {
        "https" => !host.is_empty(),
        "http" => matches!(host, "localhost" | "127.0.0.1" | "[::1]"),
        _ => false,
    };
    if ok {
        Ok(url)
    } else {
        Err(err())
    }
}

fn key_entry(provider: &str) -> Result<keyring::Entry, String> {
    if provider.is_empty()
        || !provider
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("unknown provider".into());
    }
    keyring::Entry::new("binder", &format!("assistant:{provider}")).map_err(|e| e.to_string())
}

fn key_of(provider: &str) -> Option<String> {
    key_entry(provider)
        .ok()?
        .get_password()
        .ok()
        .filter(|key| !key.trim().is_empty())
}

/// Whether a key is kept for a provider. The key itself stays here.
#[tauri::command]
pub fn assistant_key_exists(provider: String) -> bool {
    key_of(&provider).is_some()
}

#[tauri::command]
pub fn assistant_key_set(provider: String, key: String) -> Result<(), String> {
    key_entry(&provider)?
        .set_password(key.trim())
        .map_err(|_| "The key couldn't be kept in your system's credential store.".to_string())
}

#[tauri::command]
pub fn assistant_key_delete(provider: String) -> Result<(), String> {
    match key_entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Binder/", env!("CARGO_PKG_VERSION")))
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| e.to_string())
}

/// A request with the provider's key, when one is kept.
fn authorized(request: reqwest::RequestBuilder, provider: &str) -> reqwest::RequestBuilder {
    match key_of(provider) {
        Some(key) => request.bearer_auth(key.trim()),
        None => request,
    }
}

/// The address of an endpoint under the base address.
fn endpoint(base: &reqwest::Url, path: &str) -> String {
    format!("{}/{path}", base.as_str().trim_end_matches('/'))
}

/// What a provider says went wrong, or its status alone.
pub fn provider_error(status: u16, text: &str) -> String {
    let body: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let detail = body["error"]["message"]
        .as_str()
        .or_else(|| body["error"].as_str())
        .or_else(|| body["message"].as_str());
    match (status, detail) {
        (401 | 403, _) => "The provider turned the key down. Check the key in Settings.".into(),
        (_, Some(detail)) => format!("The model answered {status}: {detail}"),
        _ => format!("The model answered {status}."),
    }
}

fn unreachable(local: bool) -> String {
    if local {
        "The model on this computer didn't answer. Is it running?".into()
    } else {
        "The provider couldn't be reached. Check your connection.".into()
    }
}

fn is_local(url: &reqwest::Url) -> bool {
    matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
}

/// Model ids out of a `/models` answer: OpenAI's `{data: [{id}]}`, or a bare list.
pub fn model_ids(body: &Value) -> Vec<String> {
    let list = body["data"].as_array().or_else(|| body.as_array());
    let mut ids: Vec<String> = list
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item["id"].as_str().or_else(|| item.as_str()))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids.dedup();
    ids
}

/// The models a provider offers. Also checks the address and the key.
#[tauri::command]
pub async fn assistant_models(provider: String, base_url: String) -> Result<Vec<String>, String> {
    let base = check_base_url(&base_url)?;
    let response = authorized(client()?.get(endpoint(&base, "models")), &provider)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| unreachable(is_local(&base)))?;
    let status = response.status().as_u16();
    let text = response.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(provider_error(status, &text));
    }
    let body: Value = serde_json::from_str(&text)
        .map_err(|_| "The address didn't answer with a list of models. Check it.".to_string())?;
    Ok(model_ids(&body))
}

/// The text of a chat completion's answer.
pub fn answer_of(body: &Value) -> Result<String, String> {
    let content = &body["choices"][0]["message"]["content"];
    if let Some(text) = content.as_str() {
        return Ok(text.to_string());
    }
    if let Some(parts) = content.as_array() {
        return Ok(parts
            .iter()
            .filter_map(|part| part["text"].as_str())
            .collect::<Vec<_>>()
            .join(""));
    }
    Err("The model gave an answer Binder can't read. Check the address and the model.".into())
}

/// Requests in flight, by the id the window gave them, so `assistant_cancel` can stop one.
#[derive(Default)]
pub struct Requests(Mutex<HashMap<u32, oneshot::Sender<()>>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteArgs {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    /// Chat messages in the OpenAI shape, the system message first.
    pub messages: Vec<Value>,
    pub request_id: u32,
}

/// Asks the model once and gives its answer.
#[tauri::command]
pub async fn assistant_complete(
    args: CompleteArgs,
    requests: tauri::State<'_, Requests>,
) -> Result<String, String> {
    let base = check_base_url(&args.base_url)?;
    let (stop, stopped) = oneshot::channel();
    requests
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(args.request_id, stop);
    let result = tokio::select! {
        result = complete(&base, &args) => result,
        _ = stopped => Err("The assistant was stopped.".into()),
    };
    if let Ok(mut map) = requests.0.lock() {
        map.remove(&args.request_id);
    }
    result
}

async fn complete(base: &reqwest::Url, args: &CompleteArgs) -> Result<String, String> {
    let body = json!({ "model": args.model, "messages": args.messages, "stream": false });
    let response = authorized(
        client()?.post(endpoint(base, "chat/completions")),
        &args.provider,
    )
    .header(reqwest::header::CONTENT_TYPE, "application/json")
    .body(body.to_string())
    .send()
    .await
    .map_err(|e| {
        if e.is_timeout() {
            "The model took too long to answer.".to_string()
        } else {
            unreachable(is_local(base))
        }
    })?;
    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|_| "The model's answer was cut off. Try again.".to_string())?;
    if !(200..300).contains(&status) {
        return Err(provider_error(status, &text));
    }
    let body: Value = serde_json::from_str(&text).map_err(|_| {
        "The model gave an answer Binder can't read. Check the address and the model.".to_string()
    })?;
    answer_of(&body)
}

/// Stops a request; an unknown id is ignored.
#[tauri::command]
pub fn assistant_cancel(request_id: u32, requests: tauri::State<'_, Requests>) {
    if let Ok(mut map) = requests.0.lock() {
        if let Some(stop) = map.remove(&request_id) {
            let _ = stop.send(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_https_except_on_this_computer() {
        assert!(check_base_url("https://api.mistral.ai/v1").is_ok());
        assert!(check_base_url("http://localhost:11434/v1").is_ok());
        assert!(check_base_url("http://127.0.0.1:1234/v1").is_ok());
        assert!(check_base_url("http://[::1]:8080/v1").is_ok());
        assert!(check_base_url("http://api.example.com/v1").is_err());
        assert!(check_base_url("http://localhost.evil.com/v1").is_err());
        assert!(check_base_url("ftp://x").is_err());
        assert!(check_base_url("https://").is_err());
    }

    #[test]
    fn refuses_credentials_in_the_address() {
        assert!(check_base_url("http://localhost@evil.example/v1").is_err());
        assert!(check_base_url("http://localhost:80@evil.example/v1").is_err());
        assert!(check_base_url("https://key@api.mistral.ai/v1").is_err());
        assert!(check_base_url("https://user:pass@api.mistral.ai/v1").is_err());
    }

    #[test]
    fn builds_endpoints_under_the_base() {
        let base = check_base_url("https://api.mistral.ai/v1/").unwrap();
        assert_eq!(
            endpoint(&base, "chat/completions"),
            "https://api.mistral.ai/v1/chat/completions"
        );
    }

    #[test]
    fn reads_model_ids() {
        let openai = json!({"object": "list", "data": [{"id": "b"}, {"id": "a"}, {"id": "a"}]});
        assert_eq!(model_ids(&openai), vec!["a", "b"]);
        assert_eq!(model_ids(&json!(["x"])), vec!["x"]);
        assert!(model_ids(&json!({"models": []})).is_empty());
    }

    #[test]
    fn reads_an_answer() {
        let body = json!({"choices": [{"message": {"role": "assistant", "content": "{\"a\":1}"}}]});
        assert_eq!(answer_of(&body).unwrap(), "{\"a\":1}");
        let parts = json!({"choices": [{"message": {"content": [{"type": "text", "text": "a"}, {"text": "b"}]}}]});
        assert_eq!(answer_of(&parts).unwrap(), "ab");
        assert!(answer_of(&json!({})).is_err());
    }

    #[test]
    fn says_what_went_wrong() {
        assert!(provider_error(401, "").contains("key"));
        assert_eq!(
            provider_error(429, r#"{"error":{"message":"Rate limit reached"}}"#),
            "The model answered 429: Rate limit reached"
        );
        assert_eq!(provider_error(500, "oops"), "The model answered 500.");
    }
}
