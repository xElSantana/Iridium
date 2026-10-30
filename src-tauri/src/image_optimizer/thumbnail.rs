use std::fs;
use std::path::Path;

use super::image_processing::{decode_avif, decode_image};
use super::MAX_FILE_BYTES;

pub(crate) fn generate_thumbnail(path: &str) -> Result<String, String> {
    let source_path = Path::new(path);
    if !source_path.is_file() {
        return Err("El archivo no existe".to_string());
    }

    let metadata = fs::metadata(source_path).map_err(|_| "No se pudo leer el archivo".to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err("El archivo supera el tamaño máximo permitido".to_string());
    }

    let image = if source_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("avif"))
    {
        decode_avif(source_path)?
    } else {
        decode_image(source_path)?
    };

    let thumbnail = image.thumbnail(96, 96);
    let rgba = thumbnail.into_rgba8();
    let encoded = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
        .encode(75.0);

    let base64 = base64_encode(&encoded);
    Ok(format!("data:image/webp;base64,{base64}"))
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let byte_0 = chunk[0];
        let byte_1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let byte_2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        result.push(TABLE[(byte_0 >> 2) as usize] as char);
        result.push(TABLE[(((byte_0 & 0x03) << 4) | (byte_1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            result.push(TABLE[(((byte_1 & 0x0f) << 2) | (byte_2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(TABLE[(byte_2 & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}