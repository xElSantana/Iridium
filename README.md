# Iridium

<p align="center">
  <img src="public/icon.svg" alt="Iridium logo" width="120" />
</p>

Optimiza imágenes para reducir su peso y convertirlas entre varios formatos sin complicar el flujo de trabajo.

Iridium combina un frontend ligero con Tauri y un motor de procesamiento en Rust para ofrecer una app de escritorio rápida y enfocada en la compresión y exportación de imágenes.

## ¿Qué hace esta app?

- Reduce el tamaño de imágenes JPG, PNG, WEBP, AVIF, BMP y TIFF.
- Convierte archivos a un formato de salida elegido por el usuario.
- Ajusta la calidad de salida para equilibrar peso vs. detalle.
- Procesa varios archivos o una carpeta completa en lote.
- Guarda los resultados en una ubicación elegida por el usuario.
- Mantiene una gestión de resultados temporales para evitar pérdida de trabajo.


## Requisitos

Antes de empezar, asegúrate de tener instalado:

- Node.js >= 22.23.4
- pnpm
- Rust y toolchain de Tauri
- Dependencias del sistema para compilar Tauri en Linux (según tu entorno)

## Instalación

```bash
pnpm install
```

## Desarrollo

Para lanzar la app en modo desarrollo:

```bash
pnpm tauri dev
```

Si solo quieres arrancar la parte web de Astro:

```bash
pnpm run dev
```

## Build y empaquetado

Generar la versión web:

```bash
pnpm build
```

Compilar la app desktop con Tauri:

```bash
pnpm tauri build
```

## Flujo de uso típico

1. Abre la aplicación.
2. Selecciona una o varias imágenes o una carpeta completa.
3. Elige el formato de salida deseado.
4. Ajusta la calidad según el nivel de compresión que quieras.
5. Inicia la optimización.
6. Revisa el progreso y guarda los resultados finales donde prefieras.

## Formatos soportados

La app actualmente admite estas extensiones:

- JPG
- PNG
- WEBP
- AVIF
- BMP
- TIFF

## Licencia

Este proyecto usa la licencia MIT.
