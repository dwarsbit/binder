mod assistant;
mod history;
mod links;
mod project;
mod projects;
mod web;
mod zotero;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(assistant::Requests::default())
        .invoke_handler(tauri::generate_handler![
            project::project_load,
            project::project_write_page,
            project::project_create_folder,
            project::project_rename,
            project::project_remove,
            history::project_history_list,
            history::project_history_keep,
            project::project_files,
            project::project_read_file,
            project::project_write_file,
            project::project_open_file,
            projects::binders_list,
            projects::binders_create,
            projects::binders_opened,
            projects::binders_rename,
            projects::binders_trash,
            zotero::zotero_local_fetch,
            zotero::zotero_key_get,
            zotero::zotero_key_set,
            zotero::zotero_key_delete,
            zotero::bibtex_read,
            links::open_in_browser,
            web::web_fetch,
            web::web_download,
            assistant::assistant_key_exists,
            assistant::assistant_key_set,
            assistant::assistant_key_delete,
            assistant::assistant_models,
            assistant::assistant_complete,
            assistant::assistant_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Binder");
}
