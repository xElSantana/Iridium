import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "react-toastify";
import type { ImageFileItem } from "./useImageSelection";

interface ProgressPayload {
  type: "progress" | "error" | "success";
  current?: number;
  total?: number;
}

interface OptimizeImagesResult {
  output_folder: string;
  items: Array<{ source_path: string; output_size: number }>;
}

interface ImageConversionTranslations {
  conversionFailed: string;
  selectedImage: string;
  selectedFile: string;
  selectedFolder: string;
  progress: {
    converting: string;
    completed: string;
  };
}

export function useImageConversion(
  selectedItems: ImageFileItem[],
  quality: number,
  translations: ImageConversionTranslations,
  onItemConverted: (path: string, outputSize: number) => void,
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const unlistenProgressRef = useRef<UnlistenFn | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      unlistenProgressRef.current?.();
      unlistenProgressRef.current = null;
    };
  }, []);

  const convertImages = async () => {
    if (selectedItems.length === 0 || isProcessing) return;

    const totalImages = selectedItems.length;
    const groups = new Map<string, { format: string; paths: string[] }>();
    for (const item of selectedItems) {
      const separator = Math.max(item.path.lastIndexOf("/"), item.path.lastIndexOf("\\"));
      const directory = item.path.slice(0, separator);
      const format = item.format.toLowerCase();
      const key = `${directory}\0${format}`;
      const group = groups.get(key) ?? { format, paths: [] };
      group.paths.push(item.path);
      groups.set(key, group);
    }

    setIsProcessing(true);
    const toastId = toast.loading(
      translations.progress.converting
        .replace("{{current}}", "1")
        .replace("{{total}}", String(totalImages)),
    );

    let progressOffset = 0;
    let lastToastUpdate = 0;
    let pendingCurrent = 0;

    const updateToastProgress = (current: number) => {
      pendingCurrent = current;
      const now = performance.now();
      if (now - lastToastUpdate >= 80 || current >= totalImages) {
        lastToastUpdate = now;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        toast.update(toastId, {
          render: translations.progress.converting
            .replace("{{current}}", String(current))
            .replace("{{total}}", String(totalImages)),
        });
      } else if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          lastToastUpdate = performance.now();
          toast.update(toastId, {
            render: translations.progress.converting
              .replace("{{current}}", String(pendingCurrent))
              .replace("{{total}}", String(totalImages)),
          });
        });
      }
    };

    try {
      unlistenProgressRef.current = await listen<ProgressPayload>(
        "image-optimization-progress",
        (event) => {
          if (event.payload.type === "progress" && event.payload.current !== undefined) {
            const current = Math.min(progressOffset + event.payload.current, totalImages);
            updateToastProgress(current);
          }
        },
      );

      let completed = 0;
      for (const group of groups.values()) {
        progressOffset = completed;
        const result = await invoke<OptimizeImagesResult>("optimize_images", {
          imagePaths: group.paths,
          outputFormat: group.format,
          quality,
        });
        for (const item of result.items) {
          onItemConverted(item.source_path, item.output_size);
        }
        completed += group.paths.length;
      }

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      toast.update(toastId, {
        render: translations.progress.completed,
        type: "success",
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } catch (reason) {
      let message =
        typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "";

      const uniqueDirectories = new Set<string>();
      for (const item of selectedItems) {
        const separator = Math.max(item.path.lastIndexOf("/"), item.path.lastIndexOf("\\"));
        uniqueDirectories.add(item.path.slice(0, separator));
        message = message.replaceAll(item.path, translations.selectedImage);
        message = message.replaceAll(item.name, translations.selectedFile);
      }
      for (const directory of uniqueDirectories) {
        message = message.replaceAll(directory, translations.selectedFolder);
      }

      toast.update(toastId, {
        render: message || translations.conversionFailed,
        type: "error",
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } finally {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      unlistenProgressRef.current?.();
      unlistenProgressRef.current = null;
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    convertImages,
  };
}
