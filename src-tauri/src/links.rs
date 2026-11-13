//! Addresses Binder opens outside itself: web pages in the browser, and
//! items in Zotero by their `zotero://select/…` links.

/// Whether an address may be opened: a web page, or an item in Zotero.
/// Anything else, such as a file path or a script, stays closed.
pub fn openable(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    if url.chars().any(char::is_control) {
        return false;
    }
    let web = ["https://", "http://"]
        .iter()
        .any(|scheme| lower.starts_with(scheme) && lower.len() > scheme.len());
    web || lower.starts_with("zotero://select/")
}

/// Opens a web page in the browser, or an item in Zotero.
#[tauri::command]
pub fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !openable(&url) {
        return Err("Only web addresses and Zotero links open from Binder.".into());
    }
    app.opener()
        .open_url(url.trim(), None::<&str>)
        .map_err(|e| format!("The link couldn't be opened: {e}"))
}

#[cfg(test)]
mod tests {
    use super::openable;

    #[test]
    fn opens_web_pages_and_zotero_items_only() {
        assert!(openable("https://doi.org/10.1000/x"));
        assert!(openable("http://example.org/page"));
        assert!(openable("zotero://select/library/items/ABCD2345"));
        assert!(openable("zotero://select/groups/42/items/X1"));
        assert!(!openable("https://"));
        assert!(!openable("file:///etc/passwd"));
        assert!(!openable("javascript:alert(1)"));
        assert!(!openable("zotero://attachment/1"));
        assert!(!openable("https://example.org/\nrm"));
    }
}
