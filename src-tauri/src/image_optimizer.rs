use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::Emitter;

mod image_processing;
mod optimized_output;
mod thumbnail;

pub(crate) use self::optimized_output::{
    cleanup_current_optimization_folders, cleanup_optimized_folders,
    cleanup_stale_temp_folders, collect_optimized_files, save_optimized_files,
    BACKUP_REMAINS_CODE,
};
pub(crate) use self::thumbnail::generate_thumbnail;

const MAX_FILE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 32_768;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;
const MAX_DECODE_BYTES: u64 = 384 * 1024 * 1024;
pub(super) const SUPPORTED_EXTENSIONS: &[&str] =
    &["jpg", "jpeg", "png", "webp", "avif", "bmp", "tiff", "gif"];

#[derive(Clone, Serialize)]
pub(super) struct OptimizedItem {
    pub source_path: String,
    pub output_size: u64,
}

#[derive(Clone, Serialize)]
pub(super) struct OptimizeImagesResult {
    pub temporary_folder: String,
    pub items: Vec<OptimizedItem>,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    r#type: String,
    current: Option<u32>,
    total: Option<u32>,
    message: Option<String>,
    processed_count: Option<u32>,
    source_path: Option<String>,
    output_size: Option<u64>,
}

pub(super) fn optimize_images_blocking(
    app: tauri::AppHandle,
    image_paths: Option<Vec<String>>,
    folder_path: Option<String>,
    output_format: String,
    quality: u8,
) -> Result<OptimizeImagesResult, String> {
    if !(1..=100).contains(&quality) {
        return Err("La calidad debe estar entre 1 y 100".to_string());
    }

    let format = image_processing::normalize_format(&output_format)?;
    let images = if let Some(paths) = image_paths.filter(|paths| !paths.is_empty()) {
        paths.into_iter().map(PathBuf::from).collect::<Vec<_>>()
    } else if let Some(folder) = folder_path.filter(|folder| !folder.is_empty()) {
        image_processing::collect_folder_images(Path::new(&folder))?
    } else {
        return Err("No se proporcionaron imágenes ni carpeta para optimizar".to_string());
    };

    if images.is_empty() {
        return Err("No se encontraron imágenes válidas para procesar".to_string());
    }

    for path in &images {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase);
        if !path.is_file()
            || !extension
                .as_deref()
                .is_some_and(|extension| SUPPORTED_EXTENSIONS.contains(&extension))
        {
            return Err("La selección contiene una imagen no válida".to_string());
        }
    }

    let total = u32::try_from(images.len())
        .map_err(|_| "La cantidad de imágenes excede el límite permitido".to_string())?;
    let output_folder = optimized_output::create_temporary_output_folder(&app)?;
    emit_progress(
        &app,
        ProgressPayload {
            r#type: "progress".to_string(),
            current: Some(0),
            total: Some(total),
            message: Some(format!("Iniciando optimización de {total} imágenes...")),
            processed_count: None,
            source_path: None,
            output_size: None,
        },
    );

    let available = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let worker_count = available.clamp(1, 8).min(images.len());

    let results = Mutex::new(Vec::new());
    let next_index = AtomicUsize::new(0);
    let completed_count = AtomicU32::new(0);
    let processed_count = AtomicU32::new(0);
    let failed_count = AtomicU32::new(0);

    std::thread::scope(|scope| {
        for _ in 0..worker_count {
            scope.spawn(|| {
                while let Some(index) = {
                    let index = next_index.fetch_add(1, Ordering::Relaxed);
                    if index < images.len() {
                        Some(index)
                    } else {
                        None
                    }
                } {
                    let image_path = &images[index];
                    let name = image_path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("imagen");

                    match image_processing::process_image(image_path, &output_folder, format, quality)
                    {
                        Ok(output_size) => {
                            processed_count.fetch_add(1, Ordering::Relaxed);
                            let current = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                            let source_path = image_path.to_string_lossy().into_owned();

                            if let Ok(mut list) = results.lock() {
                                list.push(OptimizedItem {
                                    source_path: source_path.clone(),
                                    output_size,
                                });
                            }

                            emit_progress(
                                &app,
                                ProgressPayload {
                                    r#type: "progress".to_string(),
                                    current: Some(current),
                                    total: Some(total),
                                    message: Some(format!("Optimizando: {name}")),
                                    processed_count: None,
                                    source_path: Some(source_path),
                                    output_size: Some(output_size),
                                },
                            );
                        }
                        Err(error) => {
                            failed_count.fetch_add(1, Ordering::Relaxed);
                            let current = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                            emit_progress(
                                &app,
                                ProgressPayload {
                                    r#type: "error".to_string(),
                                    current: Some(current),
                                    total: Some(total),
                                    message: Some(format!("No se pudo procesar {name}: {error}")),
                                    processed_count: None,
                                    source_path: None,
                                    output_size: None,
                                },
                            );
                        }
                    }
                }
            });
        }
    });

    let failed = failed_count.load(Ordering::Relaxed);
    let processed = processed_count.load(Ordering::Relaxed);
    if failed > 0 {
        let message = format!("No se pudieron procesar {failed} de {total} imágenes.");
        emit_progress(
            &app,
            ProgressPayload {
                r#type: "error".to_string(),
                current: Some(total),
                total: Some(total),
                message: Some(message.clone()),
                processed_count: None,
                source_path: None,
                output_size: None,
            },
        );
        let temporary_folder = output_folder.to_string_lossy().into_owned();
        return match cleanup_optimized_folders(&app, &[temporary_folder]) {
            Ok(()) => Err(message),
            Err(_) => Err(format!(
                "{message} No se pudieron limpiar los archivos temporales."
            )),
        };
    }

    let temporary_folder = output_folder.to_string_lossy().into_owned();
    let items = results.into_inner().unwrap_or_default();
    emit_progress(
        &app,
        ProgressPayload {
            r#type: "success".to_string(),
            current: Some(total),
            total: Some(total),
            message: None,
            processed_count: Some(processed),
            source_path: None,
            output_size: None,
        },
    );
    Ok(OptimizeImagesResult {
        temporary_folder,
        items,
    })
}

fn emit_progress(app: &tauri::AppHandle, payload: ProgressPayload) {
    let _ = app.emit("image-optimization-progress", payload);
}
