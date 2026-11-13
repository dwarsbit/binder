//! Web pages and files on the web, fetched for an item: the text of a
//! page is kept with its item, and a PDF behind a link is saved into the
//! binder. The desktop app fetches them, since a web page can't read
//! another site.

use crate::links::openable;
use crate::project::{resolve, write_atomic};
use serde::Serialize;
use std::time::Duration;

/// The most a web page may weigh.
const PAGE_MAX: usize = 15 * 1024 * 1024;
/// The most a file behind a link may weigh.
const FILE_MAX: usize = 300 * 1024 * 1024;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    /// The address after redirects.
    pub url: String,
    /// The media type the server gave, without its parameters.
    pub content_type: String,
    /// The page's HTML; empty for anything that isn't a web page.
    pub html: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Binder/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

/// Whether an address may be fetched: a web address and nothing else.
pub fn fetchable(url: &str) -> bool {
    openable(url) && !url.trim().to_ascii_lowercase().starts_with("zotero:")
}

/// The media type of a Content-Type header: "text/html; charset=utf-8" is "text/html".
pub fn media_type_of(header: &str) -> String {
    header
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

async fn get(url: &str) -> Result<reqwest::Response, String> {
    if !fetchable(url) {
        return Err("Only web addresses can be fetched.".into());
    }
    let response = client()?.get(url.trim()).send().await.map_err(|_| {
        "The page couldn't be reached. Check the address and your connection.".to_string()
    })?;
    if !response.status().is_success() {
        return Err(format!("The site answered {}.", response.status().as_u16()));
    }
    Ok(response)
}

/// Fetches a web address. A web page comes back with its HTML; for
/// anything else only its media type comes back.
#[tauri::command]
pub async fn web_fetch(url: String) -> Result<Fetched, String> {
    let response = get(&url).await?;
    let final_url = response.url().to_string();
    let content_type = media_type_of(
        response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or(""),
    );
    let is_page = content_type.is_empty()
        || content_type == "text/html"
        || content_type == "application/xhtml+xml";
    if !is_page {
        return Ok(Fetched {
            url: final_url,
            content_type,
            html: String::new(),
        });
    }
    if response
        .content_length()
        .is_some_and(|n| n as usize > PAGE_MAX)
    {
        return Err("The page is too large to keep.".into());
    }
    let html = response
        .text()
        .await
        .map_err(|e| format!("The page couldn't be read: {e}"))?;
    if html.len() > PAGE_MAX {
        return Err("The page is too large to keep.".into());
    }
    Ok(Fetched {
        url: final_url,
        content_type,
        html,
    })
}

/// Saves the file behind a web address into the binder, at `path`.
#[tauri::command]
pub async fn web_download(dir: String, url: String, path: String) -> Result<(), String> {
    let target = resolve(&dir, &path)?;
    let response = get(&url).await?;
    if response
        .content_length()
        .is_some_and(|n| n as usize > FILE_MAX)
    {
        return Err("The file is too large to add.".into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("The file couldn't be read: {e}"))?;
    if bytes.len() > FILE_MAX {
        return Err("The file is too large to add.".into());
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("can't create the folder: {e}"))?;
    }
    write_atomic(&target, &bytes).map_err(|e| format!("can't write {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{fetchable, media_type_of};

    #[test]
    fn fetches_web_addresses_only() {
        assert!(fetchable("https://example.org/a"));
        assert!(!fetchable("zotero://select/library/items/X"));
        assert!(!fetchable("file:///etc/passwd"));
    }

    #[test]
    fn reads_media_types() {
        assert_eq!(media_type_of("text/html; charset=UTF-8"), "text/html");
        assert_eq!(media_type_of("Application/PDF"), "application/pdf");
        assert_eq!(media_type_of(""), "");
    }
}
