# Configuración de Iridium - Optimizador de Imágenes

## ✅ Completado

Has completado la configuración básica de la Opción 2 (Python embebido en el proyecto).

### Lo que ya está listo:

1. ✅ Entorno virtual Python creado en `python-env/`
2. ✅ Dependencias Python instaladas (Pillow + pillow-avif-plugin)
3. ✅ Script Python optimizador en `python-runtime/optimizer.py`
4. ✅ Backend Rust (Tauri) con comandos para:
   - Seleccionar carpetas
   - Ejecutar el optimizador Python
   - Reportar progreso en tiempo real
5. ✅ Componente React `FolderOptimizer.tsx`
6. ✅ Página `/optimizer` con interfaz completa
7. ✅ Traducciones en español configuradas
8. ✅ `.gitignore` actualizado para excluir `python-env/`

## 🚀 Próximos pasos

### 1. Instalar dependencias de Node.js

```bash
pnpm install
```

### 2. Probar en modo desarrollo

```bash
pnpm exec tauri dev
```

Esto abrirá la aplicación en modo desarrollo. Navega a `/optimizer` para probar la funcionalidad.

### 3. Si encuentras errores de compilación de Rust:

Es posible que necesites instalar el toolchain de Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 4. Prueba el flujo completo:

1. Click en "Seleccionar Carpeta"
2. Elige una carpeta con imágenes
3. Selecciona formato de salida (WebP recomendado)
4. Ajusta la calidad (85 es óptimo)
5. Click en "Optimizar Imágenes"
6. Observa el progreso en tiempo real
7. Las imágenes optimizadas estarán en `[nombre-carpeta]_optimizado`

## 🔧 Ajustes para desarrollo

### Usar Python del sistema en desarrollo

Durante el desarrollo, el código Rust busca Python en:

```
python-env/bin/python3
```

Si prefieres usar el Python del sistema temporalmente, modifica `src-tauri/src/lib.rs` línea ~40:

```rust
// Desarrollo: usar Python del sistema
let python_bin = "python3";

// Producción: usar Python embebido
// let python_bin = app.path().resource_dir()...
```

### Probar el script Python directamente

```bash
# Activar entorno virtual
source python-env/bin/activate

# Probar optimización
python python-runtime/optimizer.py /ruta/a/carpeta webp 85

# Desactivar entorno
deactivate
```

## 📦 Build de producción

Cuando estés listo para compilar la aplicación:

```bash
pnpm exec tauri build
```

Esto:

- Compila el frontend (Astro)
- Compila el backend (Rust)
- Empaqueta Python + dependencias
- Genera el instalador en `src-tauri/target/release/bundle/`

## 🐛 Solución de problemas

### Error: "No se encontró python3"

Verifica que el entorno virtual esté correctamente creado:

```bash
ls -la python-env/bin/
```

Debe existir `python3` o crear un symlink:

```bash
cd python-env/bin
ln -s python python3
```

### Error: "ModuleNotFoundError: No module named 'PIL'"

Reinstala las dependencias:

```bash
source python-env/bin/activate
pip install --force-reinstall Pillow pillow-avif-plugin
```

### La ventana de Tauri no abre

Revisa los logs en la terminal donde corriste `pnpm exec tauri dev`.

### Permisos de ejecución en Linux

Si el script Python no tiene permisos:

```bash
chmod +x python-runtime/optimizer.py
```

## 📝 Notas importantes

1. **No commites `python-env/`** - Ya está en `.gitignore`
2. **El script Python debe tener el shebang** - `#!/usr/bin/env python3` (ya incluido)
3. **Formatos recomendados**:
   - WebP: Mejor balance calidad/tamaño para web
   - AVIF: Máxima compresión, soporte moderno
   - JPG: Compatibilidad universal, sin transparencias
   - PNG: Para imágenes con transparencia

## 🎯 Características implementadas

- ✅ Selección de carpeta nativa del sistema operativo
- ✅ Conversión a WebP, AVIF, JPG, PNG
- ✅ Control de calidad (1-100)
- ✅ Progreso en tiempo real
- ✅ Barra de progreso visual
- ✅ Manejo de errores
- ✅ Mensajes en español
- ✅ Carpeta de salida con sufijo `_optimizado`
- ✅ Preservación de nombres de archivo
- ✅ Optimización automática según formato

## 🔮 Mejoras futuras (opcionales)

- [ ] Drag & drop de carpetas en la interfaz
- [ ] Preview antes/después de las imágenes
- [ ] Estadísticas de ahorro de espacio
- [ ] Cancelación de proceso en curso
- [ ] Cola de procesamiento múltiple
- [ ] Configuración de nombre de carpeta de salida
- [ ] Logs detallados
- [ ] Modo oscuro

---

¿Algún problema? Revisa este documento o consulta el README.md principal.
