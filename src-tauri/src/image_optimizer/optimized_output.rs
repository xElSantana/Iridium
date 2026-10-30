use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime};

use tauri::Manager;

use super::SUPPORTED_EXTENSIONS;

static TEMP_FOLDER_COUNTER: AtomicUsize = AtomicUsize::new(0);
static TEMP_FOLDER_LOCKS: LazyLock<Mutex<HashMap<PathBuf, File>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
const STALE_TEMP_FOLDER_AGE: Duration = Duration::from_secs(24 * 60 * 60);
pub(crate) const BACKUP_REMAINS_CODE: &str = "IRIDIUM_BACKUP_REMAINS";

fn create_private_directory(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;

        let mut builder = fs::DirBuilder::new();
        builder.mode(0o700).create(path)
    }
    #[cfg(not(unix))]
    {
        fs::create_dir(path)
    }
}

pub(super) fn create_private_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.mode(0o600);
    }
    options.open(path)
}

fn open_temporary_folder_lock(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.mode(0o600);
    }
    options.open(path)
}

fn temporary_folder_lock_path(folder: &Path) -> Result<PathBuf, String> {
    let parent = folder
        .parent()
        .ok_or_else(|| "La carpeta temporal no es válida".to_string())?;
    let name = folder
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "La carpeta temporal no es válida".to_string())?;
    Ok(parent.join(format!(".{name}.lock")))
}

pub(crate) fn cleanup_stale_temp_folders(app: &tauri::AppHandle) {
    let cache_folder = match app.path().app_cache_dir() {
        Ok(folder) => folder,
        Err(_) => {
            log::warn!("No se pudieron localizar resultados temporales antiguos");
            return;
        }
    };
    let entries = match fs::read_dir(cache_folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return,
        Err(_) => {
            log::warn!("No se pudieron revisar resultados temporales antiguos");
            return;
        }
    };
    let now = SystemTime::now();

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                log::warn!("No se pudo revisar una entrada temporal antigua");
                continue;
            }
        };
        let is_temporary_folder = entry
            .file_name()
            .to_str()
            .is_some_and(is_optimizer_temp_folder_name);
        if !is_temporary_folder {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => {
                log::warn!("No se pudo inspeccionar una entrada temporal antigua");
                continue;
            }
        };
        if !file_type.is_dir() {
            continue;
        }

        let folder = entry.path();
        let lock_path = match temporary_folder_lock_path(&folder) {
            Ok(path) => path,
            Err(_) => continue,
        };
        let has_lock_file = match fs::symlink_metadata(&lock_path) {
            Ok(metadata) if metadata.file_type().is_file() => true,
            Ok(_) => {
                log::warn!("Se omitió una carpeta temporal con marcador de bloqueo no válido");
                continue;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(_) => {
                log::warn!("No se pudo inspeccionar el bloqueo de una carpeta temporal");
                continue;
            }
        };
        let modified = match entry.metadata().and_then(|metadata| metadata.modified()) {
            Ok(modified) => modified,
            Err(_) => {
                log::warn!("No se pudo determinar la antigüedad de un resultado temporal");
                continue;
            }
        };
        let is_stale = now
            .duration_since(modified)
            .is_ok_and(|age| age >= STALE_TEMP_FOLDER_AGE);
        if !has_lock_file && !is_stale {
            continue;
        }

        let lock = match open_temporary_folder_lock(&lock_path) {
            Ok(lock) => lock,
            Err(_) => {
                log::warn!("No se pudo proteger una carpeta temporal durante su limpieza");
                continue;
            }
        };
        match lock.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => continue,
            Err(std::fs::TryLockError::Error(_)) => {
                log::warn!("No se pudo comprobar si una carpeta temporal sigue activa");
                continue;
            }
        }

        if fs::remove_dir_all(&folder).is_err() {
            log::warn!("No se pudo eliminar una carpeta temporal antigua");
            continue;
        }
        drop(lock);
        if fs::remove_file(lock_path).is_err() {
            log::warn!("No se pudo eliminar el marcador de una carpeta temporal");
        }
    }
}

fn is_optimizer_temp_folder_name(name: &str) -> bool {
    let Some(suffix) = name.strip_prefix("iridium-optimization-") else {
        return false;
    };
    let Some((process_id, counter)) = suffix.split_once('-') else {
        return false;
    };
    process_id.parse::<u32>().is_ok() && counter.parse::<usize>().is_ok()
}

pub(super) fn create_temporary_output_folder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cache_folder = app
        .path()
        .app_cache_dir()
        .map_err(|_| "No se pudo preparar la carpeta temporal".to_string())?;
    fs::create_dir_all(&cache_folder)
        .map_err(|_| "No se pudo preparar la carpeta temporal".to_string())?;
    let cache_folder = fs::canonicalize(cache_folder)
        .map_err(|_| "No se pudo preparar la carpeta temporal".to_string())?;

    for _ in 0..100 {
        let counter = TEMP_FOLDER_COUNTER.fetch_add(1, Ordering::Relaxed);
        let folder = cache_folder.join(format!(
            "iridium-optimization-{}-{counter}",
            std::process::id()
        ));
        match create_private_directory(&folder) {
            Ok(()) => {
                let lock_path = match temporary_folder_lock_path(&folder) {
                    Ok(path) => path,
                    Err(error) => {
                        let _ = fs::remove_dir_all(&folder);
                        return Err(error);
                    }
                };
                let lock = match open_temporary_folder_lock(&lock_path) {
                    Ok(lock) => lock,
                    Err(_) => {
                        let _ = fs::remove_dir_all(&folder);
                        return Err("No se pudo proteger la carpeta temporal".to_string());
                    }
                };
                match lock.try_lock() {
                    Ok(()) => {}
                    Err(std::fs::TryLockError::WouldBlock) => {
                        drop(lock);
                        return Err("No se pudo proteger la carpeta temporal".to_string());
                    }
                    Err(std::fs::TryLockError::Error(_)) => {
                        drop(lock);
                        let _ = fs::remove_file(&lock_path);
                        let _ = fs::remove_dir_all(&folder);
                        return Err("No se pudo proteger la carpeta temporal".to_string());
                    }
                }
                let mut locks = match TEMP_FOLDER_LOCKS.lock() {
                    Ok(locks) => locks,
                    Err(_) => {
                        let _ = lock.unlock();
                        drop(lock);
                        let _ = fs::remove_file(lock_path);
                        let _ = fs::remove_dir_all(&folder);
                        return Err("No se pudo proteger la carpeta temporal".to_string());
                    }
                };
                locks.insert(folder.clone(), lock);
                return Ok(folder);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("No se pudo preparar la carpeta temporal".to_string()),
        }
    }

    Err("No se pudo crear una carpeta temporal disponible".to_string())
}

fn validate_temporary_folders(
    app: &tauri::AppHandle,
    folder_paths: &[String],
) -> Result<Vec<PathBuf>, String> {
    if folder_paths.is_empty() {
        return Err("No hay resultados temporales para guardar".to_string());
    }

    let cache_folder = app
        .path()
        .app_cache_dir()
        .map_err(|_| "No se pudo acceder a los resultados temporales".to_string())?;
    let cache_folder = fs::canonicalize(cache_folder)
        .map_err(|_| "No se pudo acceder a los resultados temporales".to_string())?;
    let mut temporary_folders = HashSet::new();

    for folder_path in folder_paths {
        let metadata = fs::symlink_metadata(folder_path)
            .map_err(|_| "Los resultados temporales ya no están disponibles".to_string())?;
        if !metadata.file_type().is_dir() {
            return Err("La carpeta temporal no es válida".to_string());
        }
        let folder = fs::canonicalize(folder_path)
            .map_err(|_| "Los resultados temporales ya no están disponibles".to_string())?;
        let is_app_temporary_folder = folder.parent() == Some(cache_folder.as_path())
            && folder
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with(&format!("iridium-optimization-{}-", std::process::id()))
                });
        if !is_app_temporary_folder || !folder.is_dir() {
            return Err("La carpeta temporal no es válida".to_string());
        }
        temporary_folders.insert(folder);
    }

    let mut validated_folders = temporary_folders.into_iter().collect::<Vec<_>>();
    validated_folders.sort();
    Ok(validated_folders)
}

pub(crate) fn collect_optimized_files(
    app: &tauri::AppHandle,
    folder_paths: &[String],
) -> Result<(Vec<PathBuf>, Vec<PathBuf>), String> {
    let temporary_folders = validate_temporary_folders(app, folder_paths)?;
    let mut files = Vec::new();

    for folder in &temporary_folders {
        let entries = fs::read_dir(folder)
            .map_err(|_| "No se pudieron leer los resultados temporales".to_string())?;
        for entry in entries {
            let entry =
                entry.map_err(|_| "No se pudieron leer los resultados temporales".to_string())?;
            if !entry
                .file_type()
                .map_err(|_| "No se pudieron leer los resultados temporales".to_string())?
                .is_file()
            {
                continue;
            }
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase);
            if extension
                .as_deref()
                .is_some_and(|extension| SUPPORTED_EXTENSIONS.contains(&extension))
            {
                files.push(path);
            }
        }
    }

    files.sort();
    if files.is_empty() {
        return Err("No hay imágenes optimizadas para guardar".to_string());
    }

    Ok((temporary_folders, files))
}

pub(crate) fn cleanup_optimized_folders(
    app: &tauri::AppHandle,
    folder_paths: &[String],
) -> Result<(), String> {
    for folder_path in folder_paths {
        match fs::symlink_metadata(folder_path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(_) => {
                return Err("No se pudieron localizar los resultados temporales".to_string());
            }
            Ok(metadata) if !metadata.file_type().is_dir() => {
                return Err("La carpeta temporal no es válida".to_string());
            }
            Ok(_) => {}
        }

        for folder in validate_temporary_folders(app, std::slice::from_ref(folder_path))? {
            remove_temporary_folder(&folder)?;
        }
    }
    Ok(())
}

pub(crate) fn cleanup_current_optimization_folders(app: &tauri::AppHandle) -> Result<(), String> {
    let folder_paths = TEMP_FOLDER_LOCKS
        .lock()
        .map_err(|_| "No se pudo acceder a los resultados temporales".to_string())?
        .keys()
        .map(|folder| folder.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    cleanup_optimized_folders(app, &folder_paths)
}

fn remove_temporary_folder(folder: &Path) -> Result<(), String> {
    let lock_path = temporary_folder_lock_path(folder)?;
    let active_lock = {
        let mut locks = TEMP_FOLDER_LOCKS
            .lock()
            .map_err(|_| "No se pudo acceder al bloqueo temporal".to_string())?;
        locks.remove(folder)
    };
    let (lock, owned_by_current_app) = match active_lock {
        Some(lock) => (lock, true),
        None => {
            let lock = open_temporary_folder_lock(&lock_path)
                .map_err(|_| "No se pudo proteger la carpeta temporal".to_string())?;
            match lock.try_lock() {
                Ok(()) => (lock, false),
                Err(std::fs::TryLockError::WouldBlock) => {
                    return Err("La carpeta temporal sigue en uso".to_string());
                }
                Err(std::fs::TryLockError::Error(_)) => {
                    return Err("No se pudo proteger la carpeta temporal".to_string());
                }
            }
        }
    };

    if fs::remove_dir_all(folder).is_err() {
        if owned_by_current_app {
            match TEMP_FOLDER_LOCKS.lock() {
                Ok(mut locks) => {
                    locks.insert(folder.to_path_buf(), lock);
                }
                Err(_) => log::error!("No se pudo conservar el bloqueo de un resultado temporal"),
            }
        }
        return Err("No se pudieron limpiar los resultados temporales".to_string());
    }

    drop(lock);
    if fs::remove_file(lock_path).is_err() {
        log::warn!("No se pudo eliminar el marcador de una carpeta temporal");
    }
    Ok(())
}

pub(crate) fn save_optimized_files(files: &[PathBuf], destination: &Path) -> Result<(), String> {
    let (staging_path, staging_file) = create_staging_file(destination)?;
    drop(staging_file);

    let result = (|| {
        if files.len() == 1 {
            fs::copy(&files[0], &staging_path)
                .map(|_| ())
                .map_err(|_| "No se pudo guardar la imagen".to_string())
        } else {
            let output = File::create(&staging_path)
                .map_err(|_| "No se pudo crear el archivo ZIP".to_string())?;
            let mut archive = zip::ZipWriter::new(output);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            let mut used_names = HashSet::new();

            for file in files {
                let file_name = file
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| "El nombre de una imagen no es válido".to_string())?;
                let file_name = file_name.replace('/', "_").replace('\\', "_");
                let entry_name = unique_archive_entry_name(&file_name, &mut used_names);
                archive
                    .start_file(entry_name, options)
                    .map_err(|_| "No se pudo crear el archivo ZIP".to_string())?;
                let mut input = File::open(file)
                    .map_err(|_| "No se pudo leer una imagen optimizada".to_string())?;
                io::copy(&mut input, &mut archive)
                    .map_err(|_| "No se pudo añadir una imagen al archivo ZIP".to_string())?;
            }

            archive
                .finish()
                .map(|_| ())
                .map_err(|_| "No se pudo finalizar el archivo ZIP".to_string())
        }
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&staging_path);
        return Err(error);
    }

    commit_staging_file(&staging_path, destination)
}

fn commit_staging_file(staging_path: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(windows)]
    if destination.exists() {
        let (backup_path, backup_file) = create_backup_file(destination)?;
        drop(backup_file);
        if fs::copy(destination, &backup_path).is_err() {
            let _ = fs::remove_file(&backup_path);
            return Err("No se pudo proteger el archivo existente".to_string());
        }
        if fs::remove_file(destination).is_err() {
            let _ = fs::remove_file(&backup_path);
            return Err("No se pudo reemplazar el archivo de destino".to_string());
        }

        return match fs::rename(staging_path, destination) {
            Ok(()) => {
                if fs::remove_file(&backup_path).is_err() {
                    log::warn!("No se pudo eliminar la copia temporal del archivo reemplazado");
                }
                Ok(())
            }
            Err(_) => {
                if fs::rename(&backup_path, destination).is_ok() {
                    let _ = fs::remove_file(staging_path);
                    Err(
                        "No se pudo guardar el archivo; se restauró la versión anterior"
                            .to_string(),
                    )
                } else {
                    Err(BACKUP_REMAINS_CODE.to_string())
                }
            }
        };
    }

    fs::rename(staging_path, destination)
        .map_err(|_| "No se pudo guardar el archivo en la ruta elegida".to_string())
}

#[cfg(windows)]
fn create_backup_file(destination: &Path) -> Result<(PathBuf, File), String> {
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "La ruta elegida no es válida".to_string())?;

    for _ in 0..100 {
        let counter = TEMP_FOLDER_COUNTER.fetch_add(1, Ordering::Relaxed);
        let backup_path = parent.join(format!(
            "{file_name}.iridium-backup-{}-{counter}",
            std::process::id()
        ));
        match create_private_file(&backup_path) {
            Ok(file) => return Ok((backup_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("No se pudo preparar una copia de respaldo".to_string()),
        }
    }

    Err("No se pudo crear una copia de respaldo disponible".to_string())
}

fn create_staging_file(destination: &Path) -> Result<(PathBuf, File), String> {
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "La ruta elegida no es válida".to_string())?;

    for _ in 0..100 {
        let counter = TEMP_FOLDER_COUNTER.fetch_add(1, Ordering::Relaxed);
        let staging_path = parent.join(format!(
            ".{file_name}.iridium-{}-{counter}.tmp",
            std::process::id()
        ));
        match create_private_file(&staging_path) {
            Ok(file) => return Ok((staging_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("No se pudo preparar el archivo de salida".to_string()),
        }
    }

    Err("No se pudo crear un archivo temporal disponible".to_string())
}

fn unique_archive_entry_name(file_name: &str, used_names: &mut HashSet<String>) -> String {
    if used_names.insert(file_name.to_string()) {
        return file_name.to_string();
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imagen");
    let extension = path.extension().and_then(|value| value.to_str());
    let mut suffix = 1;
    loop {
        let name = match extension {
            Some(extension) => format!("{stem} ({suffix}).{extension}"),
            None => format!("{stem} ({suffix})"),
        };
        if used_names.insert(name.clone()) {
            return name;
        }
        suffix += 1;
    }
}
