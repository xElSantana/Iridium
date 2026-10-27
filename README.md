# Iridium - Optimizador de Imágenes

Aplicación de escritorio ultrarrápida para optimizar y convertir imágenes en lote.

## Características

- ✨ **Optimización masiva**: Procesa carpetas completas de imágenes
- 🚀 **Ultrarrápido**: Motor de optimización en Python para máximo rendimiento
- 🎨 **Múltiples formatos**: Soporta WebP, AVIF, JPG, PNG
- 📦 **Compresión inteligente**: Reduce el peso sin perder calidad visible
- 🖥️ **Multiplataforma**: Windows, macOS y Linux

## Stack Tecnológico

- **Frontend**: Astro + React + Tailwind CSS
- **Backend**: Tauri (Rust)
- **Motor de optimización**: Python (Pillow + AVIF)
- **i18n**: i18next

## Desarrollo

### Requisitos previos

- Node.js >= 22.23.4
- pnpm (gestor de paquetes)
- Python 3.12+ con venv
- Rust (para Tauri)

### Instalación

```bash
# Instalar dependencias de Node.js
pnpm install

# Crear entorno virtual de Python
python3 -m venv python-env

# Activar entorno virtual
source python-env/bin/activate  # En Linux/macOS
# o
python-env\Scripts\activate  # En Windows

# Instalar dependencias de Python
pip install -r python-runtime/requirements.txt
```

### Comandos disponibles

```bash
# Desarrollo (frontend + Tauri)
pnpm exec tauri dev

# Build de producción
pnpm exec tauri build

# Solo desarrollo del frontend
pnpm dev

# Linting
pnpm lint

# Formateo de código
pnpm format
```

### Estructura del proyecto

```
Iridium/
├── src/                    # Frontend Astro + React
│   ├── components/         # Componentes React/Astro
│   ├── pages/             # Rutas de la aplicación
│   ├── i18n/              # Traducciones
│   └── styles/            # Estilos globales
├── src-tauri/             # Backend Rust (Tauri)
│   └── src/               # Código Rust
├── python-runtime/        # Motor de optimización Python
│   ├── optimizer.py       # Script principal
│   └── requirements.txt   # Dependencias Python
└── python-env/            # Entorno virtual Python (no commitear)
```

## Cómo funciona

1. El usuario selecciona una carpeta con imágenes
2. Elige el formato de salida (WebP, AVIF, JPG, PNG)
3. Ajusta la calidad de compresión (1-100)
4. El frontend (React) invoca un comando Tauri
5. Tauri (Rust) ejecuta el script Python con las opciones seleccionadas
6. Python procesa las imágenes usando Pillow y pillow-avif-plugin
7. Las imágenes optimizadas se guardan en `[carpeta-original]_optimizado`
8. El progreso se reporta en tiempo real al frontend

## Formatos soportados

### Entrada

- JPG/JPEG
- PNG
- WebP
- AVIF
- BMP
- TIFF
- GIF

### Salida

- WebP (recomendado para web)
- AVIF (mejor compresión)
- JPG (compatibilidad universal)
- PNG (transparencias)

## Icono de escritorio

Para regenerar los iconos de la aplicación desde el archivo fuente:

```sh
pnpm exec tauri icon public/icon.png --output src-tauri/icons --fit contain
```

## Licencia

[Tu licencia aquí]
