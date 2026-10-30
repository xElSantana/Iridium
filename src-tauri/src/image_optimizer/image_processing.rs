use std::fs::{self, File};
use std::io::{self, BufWriter, Cursor, Write};
use std::path::{Path, PathBuf};

use image::{DynamicImage, ImageBuffer, ImageEncoder, ImageFormat, ImageReader, Luma};

use super::{MAX_DECODE_BYTES, MAX_FILE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, SUPPORTED_EXTENSIONS};

#[derive(Clone, Copy)]
pub(super) enum OutputFormat {
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

pub(super) fn normalize_format(format: &str) -> Result<OutputFormat, String> {
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

pub(super) fn collect_folder_images(folder: &Path) -> Result<Vec<PathBuf>, String> {
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

pub(super) fn process_image(
    source: &Path,
    output_folder: &Path,
    format: OutputFormat,
    quality: u8,
) -> Result<u64, String> {
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
    if let Err(error) = encoded {
        drop(writer);
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    drop(writer);
    let output_size = fs::metadata(&destination)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    Ok(output_size)
}

pub(super) fn decode_image(path: &Path) -> Result<DynamicImage, String> {
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

pub(super) fn decode_avif(path: &Path) -> Result<DynamicImage, String> {
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
        match super::optimized_output::create_private_file(&path) {
            Ok(file) => return Ok((path, BufWriter::new(file))),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
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