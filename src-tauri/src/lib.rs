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

#[tauri::command]
async fn save_optimized_images(
    window: tauri::WebviewWindow,
    temporary_folders: Vec<String>,
    dialog_title: String,
    image_filter: String,
    zip_filter: String,
    zip_file_name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let app = window.app_handle().clone();
    let (validated_folders, files) =
        image_optimizer::collect_optimized_files(&app, &temporary_folders)?;
    let is_archive = files.len() > 1;
    let suggested_name = if is_archive {
        zip_file_name
    } else {
        files[0]
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "El nombre de la imagen no es válido".to_string())?
            .to_string()
    };
    let dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title(dialog_title)
        .set_file_name(suggested_name);
    let selected_path = if is_archive {
        dialog
            .add_filter(zip_filter, &["zip"])
            .blocking_save_file()
    } else {
        let extension = files[0]
            .extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "El formato de la imagen no es válido".to_string())?;
        dialog
            .add_filter(image_filter, &[extension])
            .blocking_save_file()
    };

    if let Some(icon) = window.app_handle().default_window_icon() {
        let _ = window.set_icon(icon.clone());
    }

    let Some(selected_path) = selected_path else {
        return Ok(false);
    };
    let mut destination = std::path::PathBuf::from(selected_path.to_string());
    let required_extension = if is_archive {
        "zip"
    } else {
        files[0]
            .extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "El formato de la imagen no es válido".to_string())?
    };
    if !destination
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(required_extension))
    {
        destination.set_extension(required_extension);
    }
    if validated_folders
        .iter()
        .any(|folder| destination.starts_with(folder))
    {
        return Err("Selecciona una ubicación fuera de los archivos temporales".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        image_optimizer::save_optimized_files(&files, &destination)
    })
    .await
    .map_err(|_| "Error guardando los resultados".to_string())?
    .map_err(|error| {
        if error == image_optimizer::BACKUP_REMAINS_CODE {
            error
        } else {
            "Error guardando los resultados".to_string()
        }
    })?;

    if let Err(error) = image_optimizer::cleanup_optimized_folders(&app, &temporary_folders) {
        log::warn!("No se pudieron limpiar los resultados temporales: {error}");
    }

    Ok(true)
}

#[tauri::command]
fn discard_optimized_images(
    app: tauri::AppHandle,
    temporary_folders: Vec<String>,
) -> Result<(), String> {
    image_optimizer::cleanup_optimized_folders(&app, &temporary_folders)
}

#[tauri::command]
fn retry_optimization_cleanup(app: tauri::AppHandle) -> Result<(), String> {
    image_optimizer::cleanup_current_optimization_folders(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            image_optimizer::cleanup_stale_temp_folders(app.handle());

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
            select_images,
            optimize_images,
            save_optimized_images,
            discard_optimized_images,
            retry_optimization_cleanup,
            get_images_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
