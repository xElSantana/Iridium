use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::Emitter;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
struct ProgressPayload {
    r#type: String,
    current: Option<u32>,
    total: Option<u32>,
    message: Option<String>,
    output_folder: Option<String>,
    processed_count: Option<u32>,
}

#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .set_title("Selecciona la carpeta con imágenes")
        .blocking_pick_folder();
    
    match folder {
        Some(path) => Ok(path.to_string()),
        None => Err("No se seleccionó ninguna carpeta".to_string()),
    }
}

const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "avif", "bmp", "tiff", "gif"];

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
async fn select_images(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let files = app
        .dialog()
        .file()
        .set_title("Selecciona imágenes")
        .add_filter("Imágenes", SUPPORTED_EXTENSIONS)
        .blocking_pick_files();

    match files {
        Some(file_list) => {
            let paths: Vec<String> = file_list.into_iter().map(|f| f.to_string()).collect();
            if paths.is_empty() {
                Err("No se seleccionó ninguna imagen".to_string())
            } else {
                Ok(paths)
            }
        }
        None => Err("No se seleccionó ninguna imagen".to_string()),
    }
}

#[tauri::command]
async fn optimize_images(
    app: tauri::AppHandle,
    image_paths: Option<Vec<String>>,
    folder_path: Option<String>,
    output_format: String,
    quality: u8,
) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    // Obtener ruta del script Python
    let python_script = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Error obteniendo directorio de recursos: {}", e))?
        .join("python-runtime")
        .join("optimizer.py");

    // Obtener Python del entorno virtual
    let python_bin = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Error obteniendo directorio de recursos: {}", e))?
        .join("python-env")
        .join("bin")
        .join("python3");

    let mut temp_manifest_path: Option<std::path::PathBuf> = None;

    let mut cmd = Command::new(python_bin);
    cmd.arg(python_script);

    if let Some(paths) = image_paths.filter(|p| !p.is_empty()) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let manifest_file = std::env::temp_dir().join(format!("iridium_manifest_{}.json", timestamp));
        let manifest_content = serde_json::json!({
            "files": paths,
            "output_format": output_format,
            "quality": quality,
        });

        std::fs::write(&manifest_file, serde_json::to_string(&manifest_content).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Error creando archivo temporal: {}", e))?;

        cmd.arg(&manifest_file);
        temp_manifest_path = Some(manifest_file);
    } else if let Some(folder) = folder_path.filter(|f| !f.is_empty()) {
        cmd.arg(&folder)
            .arg(&output_format)
            .arg(quality.to_string());
    } else {
        return Err("No se proporcionaron imágenes ni carpeta para optimizar".to_string());
    }

    // Ejecutar script Python
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Error ejecutando Python: {}", e))?;

    let mut result_folder = String::new();

    // Leer salida línea por línea
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            if let Ok(line) = line {
                // Parsear JSON del script Python
                if let Ok(payload) = serde_json::from_str::<ProgressPayload>(&line) {
                    // Emitir evento al frontend
                    let _ = app.emit("image-optimization-progress", payload.clone());

                    if payload.r#type == "success" {
                        result_folder = payload.output_folder.unwrap_or_default();
                    } else if payload.r#type == "error" {
                        if let Some(ref tmp) = temp_manifest_path {
                            let _ = std::fs::remove_file(tmp);
                        }
                        return Err(payload.message.unwrap_or("Error desconocido".to_string()));
                    }
                }
            }
        }
    }

    // Esperar a que termine el proceso
    let status = child.wait().map_err(|e| format!("Error esperando proceso: {}", e))?;

    if let Some(ref tmp) = temp_manifest_path {
        let _ = std::fs::remove_file(tmp);
    }

    if !status.success() {
        return Err("El proceso de optimización falló".to_string());
    }

    Ok(result_folder)
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
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![select_folder, select_images, optimize_images, list_folder_images])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
