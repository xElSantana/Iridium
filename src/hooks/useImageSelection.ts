import { useCallback, useEffect, useRef, useState } from "react";
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
  outputSize?: number;
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
  const selectedItemsRef = useRef(selectedItems);
  selectedItemsRef.current = selectedItems;

  const handlePaths = async (paths: string[]) => {
    const filtered = paths.filter((path) => /\.(jpe?g|png|webp|avif|gif|bmp|tiff)$/i.test(path));
    if (filtered.length === 0) return;

    const knownPaths = new Set(selectedItemsRef.current.map((item) => item.path));
    const uniqueIncoming = [...new Set(filtered)].filter((p) => !knownPaths.has(p));
    if (uniqueIncoming.length === 0) return;

    const metadataList = await invoke<Array<{ path: string; name: string; size: number }>>(
      "get_images_metadata",
      { paths: uniqueIncoming },
    ).catch(() =>
      uniqueIncoming.map((path) => ({
        path,
        name: path.split(/[/\\]/).pop() || path,
        size: 0,
      })),
    );

    const newItems = metadataList.map((meta) => ({
      id: crypto.randomUUID(),
      path: meta.path,
      name: meta.name,
      url: convertFileSrc(meta.path),
      format: globalFormat,
      size: meta.size,
    }));

    setSelectedItems((previous) => [...previous, ...newItems]);
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

  const removeItem = useCallback((id: string) => {
    setSelectedItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const clearItems = useCallback(() => {
    setSelectedItems([]);
  }, []);

  const updateItemFormat = useCallback((id: string, format: string) => {
    setSelectedItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, format } : item)),
    );
  }, []);

  const updateItemOutputSize = useCallback((path: string, outputSize: number) => {
    setSelectedItems((previous) =>
      previous.map((item) => (item.path === path ? { ...item, outputSize } : item)),
    );
  }, []);

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
    clearItems,
    updateItemFormat,
    updateItemOutputSize,
  };
}
