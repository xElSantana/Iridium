# Configuración de Iridium - Optimizador de Imágenes

## Requisitos

- Node.js >= 22.23.4
- pnpm
- Rust y los requisitos de sistema de Tauri 2

## Desarrollo

Instala las dependencias del frontend y ejecuta la aplicación de escritorio:

```bash
pnpm install
cargo check --manifest-path src-tauri/Cargo.toml
pnpm exec tauri dev
```

La primera compilación de Rust resolverá las dependencias nativas de imagen y actualizará `src-tauri/Cargo.lock`. No se requiere Python ni un entorno virtual.

## Producción

```bash
pnpm exec tauri build
```

El procesamiento se ejecuta en Rust dentro del proceso Tauri. La salida se guarda en una carpeta hermana con el sufijo `_optimizado`; los archivos existentes no se sobrescriben.
