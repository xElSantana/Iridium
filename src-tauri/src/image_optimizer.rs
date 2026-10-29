use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};

use image::{DynamicImage, ImageBuffer, ImageEncoder, ImageFormat, ImageReader, Luma};
use serde::Serialize;
use tauri::Emitter;

const MAX_FILE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 32_768;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;
const MAX_DECODE_BYTES: u64 = 384 * 1024 * 1024;
pub(super) const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "avif", "bmp", "tiff", "gif"];

#[derive(Clone, Serialize)]
struct ProgressPayload {
    r#type: String,
    current: Option<u32>,
    total: Option<u32>,
    message: Option<String>,
    output_folder: Option<String>,
    processed_count: Option<u32>,
}

pub(super) fn optimize_images_blocking(
    app: tauri::AppHandle,
    image_paths: Option<Vec<String>>,
    folder_path: Option<String>,
    output_format: String,
    quality: u8,
) -> Result<String, String> {
    if !(1..=100).contains(&quality) {
        return Err("La calidad debe estar entre 1 y 100".to_string());
    }

    let format = normalize_format(&output_format)?;
    let images = if let Some(paths) = image_paths.filter(|paths| !paths.is_empty()) {
        paths.into_iter().map(PathBuf::from).collect::<Vec<_>>()
    } else if let Some(folder) = folder_path.filter(|folder| !folder.is_empty()) {
        collect_folder_images(Path::new(&folder))?
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

    let output_folder = output_folder_for(&images[0])?;
    fs::create_dir_all(&output_folder)
        .map_err(|_| "No se pudo crear la carpeta de salida".to_string())?;

    let total = u32::try_from(images.len())
        .map_err(|_| "La cantidad de imágenes excede el límite permitido".to_string())?;
    emit_progress(
        &app,
        ProgressPayload {
            r#type: "progress".to_string(),
            current: Some(0),
            total: Some(total),
            message: Some(format!("Iniciando optimización de {total} imágenes...")),
            output_folder: None,
            processed_count: None,
        },
    );

    let available = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let worker_count = available.clamp(1, 8).min(images.len());

    let next_index = AtomicUsize::new(0);
    let completed_count = AtomicU32::new(0);
    let processed_count = AtomicU32::new(0);
    let failed_count = AtomicU32::new(0);

    std::thread::scope(|scope| {
        for _ in 0..worker_count {
            scope.spawn(|| {
                while let Some(index) = {
                    let idx = next_index.fetch_add(1, Ordering::Relaxed);
                    if idx < images.len() {
                        Some(idx)
                    } else {
                        None
                    }
                } {
                    let image_path = &images[index];
                    let name = image_path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("imagen");

                    match process_image(image_path, &output_folder, format, quality) {
                        Ok(()) => {
                            processed_count.fetch_add(1, Ordering::Relaxed);
                            let current = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                            emit_progress(
                                &app,
                                ProgressPayload {
                                    r#type: "progress".to_string(),
                                    current: Some(current),
                                    total: Some(total),
                                    message: Some(format!("Optimizando: {name}")),
                                    output_folder: None,
                                    processed_count: None,
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
                                    output_folder: None,
                                    processed_count: None,
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
                output_folder: None,
                processed_count: None,
            },
        );
        return Err(message);
    }

    let output_folder = output_folder.to_string_lossy().into_owned();
    emit_progress(
        &app,
        ProgressPayload {
            r#type: "success".to_string(),
            current: Some(total),
            total: Some(total),
            message: None,
            output_folder: Some(output_folder.clone()),
            processed_count: Some(processed),
        },
    );
    Ok(output_folder)
}

#[derive(Clone, Copy)]
enum OutputFormat {
    Jpeg,
    Png,
    Webp,
    Avif,
    Bmp,
    Tiff,
}

impl OutputFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::Webp => "webp",
            Self::Avif => "avif",
            Self::Bmp => "bmp",
            Self::Tiff => "tiff",
        }
    }
}

fn normalize_format(format: &str) -> Result<OutputFormat, String> {
    match format.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Ok(OutputFormat::Jpeg),
        "png" => Ok(OutputFormat::Png),
        "webp" => Ok(OutputFormat::Webp),
        "avif" => Ok(OutputFormat::Avif),
        "bmp" => Ok(OutputFormat::Bmp),
        "tiff" => Ok(OutputFormat::Tiff),
        _ => Err("El formato de salida no está soportado".to_string()),
    }
}

fn collect_folder_images(folder: &Path) -> Result<Vec<PathBuf>, String> {
    if !folder.is_dir() {
        return Err("La carpeta seleccionada no es válida".to_string());
    }

    let entries = fs::read_dir(folder).map_err(|_| "No se pudo leer la carpeta".to_string())?;
    let mut images = Vec::new();
    for entry in entries {
        let path = entry
            .map_err(|_| "No se pudo leer el contenido de la carpeta".to_string())?
            .path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase);
        if path.is_file()
            && extension
                .as_deref()
                .is_some_and(|extension| SUPPORTED_EXTENSIONS.contains(&extension))
        {
            images.push(path);
        }
    }
    images.sort();
    Ok(images)
}

fn output_folder_for(first_image: &Path) -> Result<PathBuf, String> {
    let parent = first_image
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let folder_name = parent
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    Ok(parent.join(format!("{folder_name}_optimizado")))
}

fn process_image(
    source: &Path,
    output_folder: &Path,
    format: OutputFormat,
    quality: u8,
) -> Result<(), String> {
    let metadata = fs::metadata(source).map_err(|_| "El archivo no se pudo abrir".to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err("El archivo supera el tamaño máximo permitido".to_string());
    }

    let image = if source
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("avif"))
    {
        decode_avif(source)?
    } else {
        decode_image(source)?
    };

    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imagen");
    let (destination, mut writer) = create_output_file(output_folder, stem, format.extension())?;
    let encoded = encode_image(image, &mut writer, format, quality);
    if encoded.is_err() {
        drop(writer);
        let _ = fs::remove_file(destination);
    }
    encoded
}

fn decode_image(path: &Path) -> Result<DynamicImage, String> {
    let mut reader = ImageReader::open(path)
        .map_err(|_| "El archivo no se pudo abrir".to_string())?
        .with_guessed_format()
        .map_err(|_| "No se pudo determinar el formato de la imagen".to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "No se pudo decodificar la imagen".to_string())?;
    validate_dimensions(image.width(), image.height())?;
    Ok(image)
}

fn decode_avif(path: &Path) -> Result<DynamicImage, String> {
    let bytes = fs::read(path).map_err(|_| "El archivo no se pudo leer".to_string())?;
    let mut cursor = Cursor::new(bytes.as_slice());
    let parsed = avif_parse::read_avif(&mut cursor)
        .map_err(|_| "El archivo AVIF está dañado o no es compatible".to_string())?;
    let dimensions = parsed
        .primary_item_metadata()
        .map_err(|_| "No se pudieron leer las dimensiones del AVIF".to_string())?;
    if !dimensions.still_picture {
        return Err("No se admiten imágenes AVIF animadas".to_string());
    }
    let width = dimensions.max_frame_width.get();
    let height = dimensions.max_frame_height.get();
    validate_dimensions(width, height)?;

    let decoded = avif_decode::Decoder::from_avif(&bytes)
        .and_then(avif_decode::Decoder::to_image)
        .map_err(|_| "No se pudo decodificar la imagen AVIF".to_string())?;
    match decoded {
        avif_decode::Image::Rgb8(pixels) => {
            let raw: Vec<u8> = pixels
                .buf()
                .iter()
                .flat_map(|pixel| [pixel.r, pixel.g, pixel.b])
                .collect();
            ImageBuffer::from_raw(width, height, raw)
                .map(DynamicImage::ImageRgb8)
                .ok_or_else(|| "Los datos de la imagen AVIF no son válidos".to_string())
        }
        avif_decode::Image::Rgb16(pixels) => {
            let raw: Vec<u8> = pixels
                .buf()
                .iter()
                .flat_map(|pixel| [to_u8(pixel.r), to_u8(pixel.g), to_u8(pixel.b)])
                .collect();
            ImageBuffer::from_raw(width, height, raw)
                .map(DynamicImage::ImageRgb8)
                .ok_or_else(|| "Los datos de la imagen AVIF no son válidos".to_string())
        }
        avif_decode::Image::Rgba8(pixels) => {
            let raw: Vec<u8> = pixels
                .buf()
                .iter()
                .flat_map(|pixel| [pixel.r, pixel.g, pixel.b, pixel.a])
                .collect();
            ImageBuffer::from_raw(width, height, raw)
                .map(DynamicImage::ImageRgba8)
                .ok_or_else(|| "Los datos de la imagen AVIF no son válidos".to_string())
        }
        avif_decode::Image::Rgba16(pixels) => {
            let raw: Vec<u8> = pixels
                .buf()
                .iter()
                .flat_map(|pixel| {
                    [
                        to_u8(pixel.r),
                        to_u8(pixel.g),
                        to_u8(pixel.b),
                        to_u8(pixel.a),
                    ]
                })
                .collect();
            ImageBuffer::from_raw(width, height, raw)
                .map(DynamicImage::ImageRgba8)
                .ok_or_else(|| "Los datos de la imagen AVIF no son válidos".to_string())
        }
        avif_decode::Image::Gray8(pixels) => {
            let raw = pixels.buf().iter().map(|pixel| pixel.value()).collect();
            ImageBuffer::<Luma<u8>, Vec<u8>>::from_raw(width, height, raw)
                .map(DynamicImage::ImageLuma8)
                .ok_or_else(|| "Los datos de la imagen AVIF no son válidos".to_string())
        }
        avif_decode::Image::Gray16(pixels) => {
            let raw = pixels.buf().iter().map(|pixel| pixel.value()).collect();
            ImageBuffer::<Luma<u16>, Vec<u16>>::from_raw(width, height, raw)
                .map(DynamicImage::ImageLuma16)
                .ok_or_else(|| "Los datos de la imagen AVIF no son válidos".to_string())
        }
    }
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err("Las dimensiones de la imagen superan el límite permitido".to_string());
    }
    Ok(())
}

fn to_u8(value: u16) -> u8 {
    ((u32::from(value) + 128) / 257) as u8
}

fn create_output_file(
    output_folder: &Path,
    stem: &str,
    extension: &str,
) -> Result<(PathBuf, BufWriter<File>), String> {
    for suffix in 0..10_000 {
        let name = if suffix == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem} ({suffix}).{extension}")
        };
        let path = output_folder.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, BufWriter::new(file))),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("No se pudo crear el archivo de salida".to_string()),
        }
    }
    Err("No se pudo encontrar un nombre libre para el archivo de salida".to_string())
}

fn encode_image(
    image: DynamicImage,
    writer: &mut BufWriter<File>,
    format: OutputFormat,
    quality: u8,
) -> Result<(), String> {
    match format {
        OutputFormat::Jpeg => {
            let rgb = flatten_on_white(image);
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut *writer, quality)
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|_| "No se pudo codificar la imagen JPEG".to_string())?;
        }
        OutputFormat::Png => {
            image
                .write_to(&mut *writer, ImageFormat::Png)
                .map_err(|_| "No se pudo codificar la imagen PNG".to_string())?;
        }
        OutputFormat::Webp => {
            let encoded = match image {
                DynamicImage::ImageRgb8(rgb) => {
                    webp::Encoder::from_rgb(rgb.as_raw(), rgb.width(), rgb.height())
                        .encode(f32::from(quality))
                }
                DynamicImage::ImageLuma8(luma) => {
                    let rgb = DynamicImage::ImageLuma8(luma).into_rgb8();
                    webp::Encoder::from_rgb(rgb.as_raw(), rgb.width(), rgb.height())
                        .encode(f32::from(quality))
                }
                other => {
                    let rgba = other.into_rgba8();
                    webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
                        .encode(f32::from(quality))
                }
            };
            writer
                .write_all(&encoded)
                .map_err(|_| "No se pudo guardar la imagen WebP".to_string())?;
        }
        OutputFormat::Avif => {
            let rgba = image.into_rgba8();
            image::codecs::avif::AvifEncoder::new_with_speed_quality(&mut *writer, 8, quality)
                .write_image(
                    rgba.as_raw(),
                    rgba.width(),
                    rgba.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|_| "No se pudo codificar la imagen AVIF".to_string())?;
        }
        OutputFormat::Bmp => {
            let rgb = flatten_on_white(image);
            DynamicImage::ImageRgb8(rgb)
                .write_to(&mut *writer, ImageFormat::Bmp)
                .map_err(|_| "No se pudo codificar la imagen BMP".to_string())?;
        }
        OutputFormat::Tiff => {
            image
                .write_to(&mut *writer, ImageFormat::Tiff)
                .map_err(|_| "No se pudo codificar la imagen TIFF".to_string())?;
        }
    }
    writer
        .flush()
        .map_err(|_| "No se pudo escribir en el archivo de salida".to_string())
}

fn flatten_on_white(image: DynamicImage) -> image::RgbImage {
    match image {
        DynamicImage::ImageRgb8(rgb) => rgb,
        DynamicImage::ImageLuma8(luma) => DynamicImage::ImageLuma8(luma).into_rgb8(),
        DynamicImage::ImageRgb16(rgb16) => DynamicImage::ImageRgb16(rgb16).into_rgb8(),
        DynamicImage::ImageLuma16(luma16) => DynamicImage::ImageLuma16(luma16).into_rgb8(),
        other => {
            let rgba = other.into_rgba8();
            let width = rgba.width();
            let height = rgba.height();
            let raw = rgba.into_raw();
            let mut rgb_raw = Vec::with_capacity((width * height * 3) as usize);
            for chunk in raw.chunks_exact(4) {
                let alpha = u16::from(chunk[3]);
                let blend = |channel: u8| -> u8 {
                    ((u16::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
                };
                rgb_raw.push(blend(chunk[0]));
                rgb_raw.push(blend(chunk[1]));
                rgb_raw.push(blend(chunk[2]));
            }
            ImageBuffer::from_raw(width, height, rgb_raw)
                .unwrap_or_else(|| ImageBuffer::new(width, height))
        }
    }
}

fn emit_progress(app: &tauri::AppHandle, payload: ProgressPayload) {
    let _ = app.emit("image-optimization-progress", payload);
}