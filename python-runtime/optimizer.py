#!/usr/bin/env python3
"""
Optimizador de imágenes para Iridium
Procesa carpetas completas, convierte formatos y optimiza el peso sin perder calidad
"""

import os
import sys
import json
import subprocess
from pathlib import Path

def _ensure_dependencies():
    """Instala dependencias faltantes en tiempo de ejecución."""
    required = [
        ('PIL', 'Pillow==13.0.0'),
        ('pillow_avif', 'pillow-avif-plugin==1.6.0'),
    ]
    for module_name, package in required:
        try:
            __import__(module_name)
        except ImportError:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install', '--quiet', package],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

_ensure_dependencies()

from PIL import Image
import pillow_avif  # type: ignore[import-untyped] – instalado en runtime por _ensure_dependencies()

# Formatos soportados
SUPPORTED_INPUT_FORMATS = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp', '.tiff', '.gif'}
OUTPUT_FORMATS = {
    'webp': 'WebP',
    'avif': 'AVIF',
    'jpg': 'JPEG',
    'jpeg': 'JPEG',
    'png': 'PNG'
}

def send_progress(current, total, message):
    """Envía progreso al proceso padre (Tauri)"""
    progress_data = {
        'type': 'progress',
        'current': current,
        'total': total,
        'message': message
    }
    print(json.dumps(progress_data), flush=True)

def send_error(message):
    """Envía error al proceso padre"""
    error_data = {
        'type': 'error',
        'message': message
    }
    print(json.dumps(error_data), flush=True)

def send_success(output_folder, processed_count):
    """Envía resultado exitoso"""
    success_data = {
        'type': 'success',
        'output_folder': output_folder,
        'processed_count': processed_count
    }
    print(json.dumps(success_data), flush=True)

def get_image_files(folder_path):
    """Obtiene todas las imágenes en la carpeta"""
    image_files = []
    for file in Path(folder_path).iterdir():
        if file.is_file() and file.suffix.lower() in SUPPORTED_INPUT_FORMATS:
            image_files.append(file)
    return image_files

def optimize_image(input_path, output_path, output_format, quality=85):
    """
    Optimiza una imagen individual
    
    Args:
        input_path: Ruta de la imagen original
        output_path: Ruta donde guardar la imagen optimizada
        output_format: Formato de salida (webp, avif, jpg, png)
        quality: Calidad de compresión (1-100, default 85)
    """
    try:
        with Image.open(input_path) as img:
            # Convertir a RGB si es necesario (para JPEG/WebP)
            if img.mode in ('RGBA', 'LA') and output_format.lower() in ['jpg', 'jpeg']:
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA' if output_format.lower() in ['png', 'webp', 'avif'] else 'RGB')
            
            # Configurar opciones de guardado según formato
            save_kwargs = {}
            
            if output_format.lower() == 'webp':
                save_kwargs = {
                    'format': 'WebP',
                    'quality': quality,
                    'method': 6  # Mejor compresión
                }
            elif output_format.lower() == 'avif':
                save_kwargs = {
                    'format': 'AVIF',
                    'quality': quality,
                    'speed': 6  # Balance entre velocidad y compresión
                }
            elif output_format.lower() in ['jpg', 'jpeg']:
                save_kwargs = {
                    'format': 'JPEG',
                    'quality': quality,
                    'optimize': True
                }
            elif output_format.lower() == 'png':
                save_kwargs = {
                    'format': 'PNG',
                    'optimize': True
                }
            
            # Guardar imagen optimizada
            img.save(output_path, **save_kwargs)
            return True
            
    except Exception as e:
        send_error(f"Error procesando {input_path.name}: {str(e)}")
        return False

def process_folder(input_folder, output_format, quality=85):
    """
    Procesa toda una carpeta de imágenes
    
    Args:
        input_folder: Ruta de la carpeta con imágenes
        output_format: Formato de salida deseado
        quality: Calidad de compresión (1-100)
    """
    try:
        input_path = Path(input_folder)
        
        if not input_path.exists() or not input_path.is_dir():
            send_error(f"La carpeta no existe: {input_folder}")
            return
        
        # Crear carpeta de salida
        output_folder_name = f"{input_path.name}_optimizado"
        output_path = input_path.parent / output_folder_name
        output_path.mkdir(exist_ok=True)
        
        # Obtener lista de imágenes
        image_files = get_image_files(input_path)
        total_images = len(image_files)
        
        if total_images == 0:
            send_error("No se encontraron imágenes en la carpeta")
            return
        
        send_progress(0, total_images, f"Iniciando optimización de {total_images} imágenes...")
        
        # Procesar cada imagen
        processed_count = 0
        for idx, image_file in enumerate(image_files, 1):
            output_file = output_path / f"{image_file.stem}.{output_format.lower()}"
            
            send_progress(idx, total_images, f"Optimizando: {image_file.name}")
            
            if optimize_image(image_file, output_file, output_format, quality):
                processed_count += 1
        
        # Enviar resultado final
        send_success(str(output_path), processed_count)
        
    except Exception as e:
        send_error(f"Error general: {str(e)}")

def process_images_manifest(manifest_path):
    """Procesa una lista de imágenes definida en un manifiesto JSON"""
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        raw_files = data.get('files', [])
        files = [Path(p) for p in raw_files if Path(p).exists() and Path(p).is_file()]
        total_images = len(files)

        if total_images == 0:
            send_error("No se encontraron imágenes válidas para procesar")
            return

        output_format = data.get('output_format', 'webp').lower()
        quality = int(data.get('quality', 85))
        output_folder_str = data.get('output_folder')

        if output_folder_str:
            output_path = Path(output_folder_str)
        else:
            first_file = files[0]
            output_path = first_file.parent / f"{first_file.parent.name}_optimizado"

        output_path.mkdir(exist_ok=True, parents=True)
        send_progress(0, total_images, f"Iniciando optimización de {total_images} imágenes...")

        processed_count = 0
        for idx, image_file in enumerate(files, 1):
            output_file = output_path / f"{image_file.stem}.{output_format}"
            send_progress(idx, total_images, f"Optimizando: {image_file.name}")
            if optimize_image(image_file, output_file, output_format, quality):
                processed_count += 1

        send_success(str(output_path), processed_count)
    except Exception as e:
        send_error(f"Error procesando manifiesto: {str(e)}")

def main():
    """Función principal"""
    if len(sys.argv) < 2:
        send_error("Uso: optimizer.py <carpeta_entrada|manifest.json> [formato_salida] [calidad]")
        sys.exit(1)

    first_arg = sys.argv[1]
    if first_arg.endswith('.json') and Path(first_arg).is_file():
        process_images_manifest(first_arg)
        return

    if len(sys.argv) < 3:
        send_error("Uso: optimizer.py <carpeta_entrada> <formato_salida> [calidad]")
        sys.exit(1)

    input_folder = first_arg
    output_format = sys.argv[2].lower()
    quality = int(sys.argv[3]) if len(sys.argv) > 3 else 85

    if output_format not in OUTPUT_FORMATS:
        send_error(f"Formato no soportado: {output_format}. Usa: {', '.join(OUTPUT_FORMATS.keys())}")
        sys.exit(1)

    if not (1 <= quality <= 100):
        send_error("La calidad debe estar entre 1 y 100")
        sys.exit(1)

    process_folder(input_folder, output_format, quality)

if __name__ == "__main__":
    main()
