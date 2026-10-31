# Iridium - Optimizador de Imágenes

Aplicación de escritorio ultrarrápida para optimizar y convertir imágenes en lote.

## Características

- ✨ **Optimización masiva**: Procesa carpetas completas de imágenes
- 🚀 **Nativo**: Procesamiento de imágenes integrado en Rust
- 🎨 **Múltiples formatos**: Soporta WebP, AVIF, JPG, PNG
- 📦 **Compresión inteligente**: Reduce el peso sin perder calidad visible
- 🖥️ **Multiplataforma**: Windows, macOS y Linux

## Stack Tecnológico

- **Frontend**: Astro + React + Tailwind CSS
- **Backend**: Tauri (Rust)
- **Procesamiento de imágenes**: Rust (`image`, WebP y AVIF)
- **i18n**: i18next

## Desarrollo

### Requisitos previos

- Node.js >= 22.23.4
- pnpm (gestor de paquetes)
- Rust (para Tauri)

### Instalación

```bash
# Instalar dependencias de Node.js
pnpm install
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

## Publicar una versión

1. Actualiza la versión en `package.json`.
2. Desde Control de código fuente de VS Code, confirma los cambios y súbelos a GitHub.
3. Abre la paleta de comandos (`Ctrl+Shift+P`) y ejecuta **Git: Create Tag**. Crea un tag con el prefijo `v` y la misma versión, por ejemplo `v1.1.0`.
4. Ejecuta **Git: Push Tags** para subir el tag. Esto dispara el workflow de GitHub Actions.
5. Cuando termine, revisa la release en borrador y publícala desde GitHub.

El workflow compila para Windows, Linux y macOS. En Linux genera paquetes AppImage, `.deb` y `.rpm`.

### Estructura del proyecto

```
Iridium/
├── src/                    # Frontend Astro + React
│   ├── components/         # Componentes React/Astro
│   ├── pages/             # Rutas de la aplicación
│   ├── i18n/              # Traducciones
│   └── styles/            # Estilos globales
└── src-tauri/             # Backend Tauri y procesamiento Rust
	└── src/               # Código Rust
```

## Cómo funciona

1. El usuario selecciona una carpeta con imágenes
2. Elige el formato de salida (WebP, AVIF, JPG, PNG)
3. Ajusta la calidad de compresión (1-100)
4. El frontend (React) invoca un comando Tauri
5. Tauri procesa las imágenes con las bibliotecas Rust incluidas en la aplicación
6. Las imágenes optimizadas se guardan en `[carpeta-original]_optimizado`
7. El progreso se reporta en tiempo real al frontend

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
