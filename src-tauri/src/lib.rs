use serde::Serialize;
use tauri::{webview::PageLoadEvent, Manager};
mod image_optimizer;

use image_optimizer::SUPPORTED_EXTENSIONS;

#[derive(Serialize)]
struct ImageMetadata {
    path: String,
    name: String,
    size: u64,
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|_| "No se pudo leer el tamaño del archivo".to_string())
}

#[tauri::command]
fn get_images_metadata(paths: Vec<String>) -> Vec<ImageMetadata> {
    paths
        .into_iter()
        .map(|path| {
            let path_obj = std::path::Path::new(&path);
            let name = path_obj
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("imagen")
                .to_string();
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            ImageMetadata { path, name, size }
        })
        .collect()
}

#[tauri::command]
async fn get_image_thumbnail(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || image_optimizer::generate_thumbnail(&path))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r)
}

#[tauri::command]
async fn select_folder(window: tauri::WebviewWindow) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Selecciona la carpeta con imágenes")
        .blocking_pick_folder();

    if let Some(icon) = window.app_handle().default_window_icon() {
        let _ = window.set_icon(icon.clone());
    }

    match folder {
        Some(path) => Ok(path.to_string()),
        None => Err("No se seleccionó ninguna carpeta".to_string()),
    }
}

#[tauri::command]
fn list_folder_images(folder_path: String) -> Result<Vec<String>, String> {
    use std::fs;

    let dir = std::path::Path::new(&folder_path);
    if !dir.is_dir() {
        return Err(format!("No es una carpeta válida: {}", folder_path));
    }

    let entries = fs::read_dir(dir).map_err(|e| format!("Error leyendo carpeta: {}", e))?;

    let mut paths: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let ext = path.extension()?.to_str()?.to_lowercase();
            if SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
                path.to_str().map(|s| s.to_owned())
            } else {
                None
            }
        })
        .collect();

    paths.sort();
    Ok(paths)
}

#[tauri::command]
async fn select_images(window: tauri::WebviewWindow) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let files = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Selecciona imágenes")
        .add_filter("Imágenes", SUPPORTED_EXTENSIONS)
        .blocking_pick_files();

    if let Some(icon) = window.app_handle().default_window_icon() {
        let _ = window.set_icon(icon.clone());
    }

    match files {
        Some(file_list) => {
            let paths: Vec<String> = file_list.into_iter().map(|f| f.to_string()).collect();
            Ok(paths)
        }
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
async fn optimize_images(
    app: tauri::AppHandle,
    image_paths: Option<Vec<String>>,
    folder_path: Option<String>,
    output_format: String,
    quality: u8,
) -> Result<image_optimizer::OptimizeImagesResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_optimizer::optimize_images_blocking(app, image_paths, folder_path, output_format, quality)
    })
    .await
    .map_err(|error| format!("Error ejecutando optimización: {error}"))
    .and_then(|result| result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let window_config = &app.config().app.windows[0];
            tauri::WebviewWindowBuilder::from_config(app, window_config)?
                .on_page_load(|window, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        if let Err(error) = window.show() {
                            log::error!("No se pudo mostrar la ventana principal: {error}");
                        }
                    }
                })
                .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_folder,
            select_images,
            optimize_images,
            list_folder_images,
            get_file_size,
            get_images_metadata,
            get_image_thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
