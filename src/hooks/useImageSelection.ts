import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface ImageFileItem {
  id: string;
  path: string;
  name: string;
  url: string;
  format: string;
  size: number;
}

interface ImageSelectionTranslations {
  selectImagesFailed: string;
  unknownError: string;
}

export function useImageSelection(translations: ImageSelectionTranslations) {
  const [selectedItems, setSelectedItems] = useState<ImageFileItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState("JPG");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const handlePaths = async (paths: string[]) => {
    const filtered = paths.filter((path) => /\.(jpe?g|png|webp|avif|gif|bmp|tiff)$/i.test(path));
    if (filtered.length === 0) return;

    const newItems = await Promise.all(
      filtered.map(async (path) => {
        const size = await invoke<number>("get_file_size", { path }).catch(() => 0);
        return {
          id: crypto.randomUUID(),
          path,
          name: path.split(/[/\\]/).pop() || path,
          url: convertFileSrc(path),
          format: globalFormat,
          size,
        };
      }),
    );

    setSelectedItems((previous) => {
      const knownPaths = new Set(previous.map((item) => item.path));
      const uniqueItems = newItems.filter((item) => {
        if (knownPaths.has(item.path)) return false;
        knownPaths.add(item.path);
        return true;
      });
      return [...previous, ...uniqueItems];
    });
    setError("");
  };

  const handlePathsRef = useRef(handlePaths);
  handlePathsRef.current = handlePaths;

  const selectImages = async () => {
    try {
      const paths = await invoke<string[]>("select_images");
      await handlePaths(paths);
    } catch {
      setError(translations.selectImagesFailed);
    }
  };

  const removeItem = (id: string) => {
    setSelectedItems((previous) => previous.filter((item) => item.id !== id));
  };

  const updateItemFormat = (id: string, format: string) => {
    setSelectedItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, format } : item)),
    );
  };

  useEffect(() => {
    const handleFormatChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ format?: string }>;
      if (!customEvent.detail?.format) return;

      const newFormat = customEvent.detail.format.toUpperCase();
      setGlobalFormat(newFormat);
      setSelectedItems((previous) => previous.map((item) => ({ ...item, format: newFormat })));
    };

    window.addEventListener("formatChanged", handleFormatChange);
    return () => window.removeEventListener("formatChanged", handleFormatChange);
  }, []);

  useEffect(() => {
    let unlistenDrop: UnlistenFn | undefined;
    let disposed = false;

    const registerDropListener = async () => {
      try {
        unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "leave") {
            setIsDragging(false);
            return;
          }

          const bounds = dropzoneRef.current?.getBoundingClientRect();
          const scale = window.devicePixelRatio || 1;
          const { x, y } = event.payload.position;
          const insideDropzone =
            bounds !== undefined &&
            x / scale >= bounds.left &&
            x / scale <= bounds.right &&
            y / scale >= bounds.top &&
            y / scale <= bounds.bottom;

          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragging(insideDropzone);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (insideDropzone) void handlePathsRef.current(event.payload.paths);
          }
        });

        if (disposed) unlistenDrop();
      } catch {
        setError(translations.unknownError);
      }
    };

    void registerDropListener();

    return () => {
      disposed = true;
      unlistenDrop?.();
    };
  }, [translations.unknownError]);

  return {
    dropzoneRef,
    selectedItems,
    isDragging,
    error,
    clearError: () => setError(""),
    selectImages,
    removeItem,
    updateItemFormat,
  };
}
