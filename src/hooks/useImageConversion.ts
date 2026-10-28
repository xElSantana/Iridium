import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ImageFileItem } from "./useImageSelection";

export interface ProgressPayload {
  type: "progress" | "error" | "success";
  current?: number;
  total?: number;
  message?: string;
  output_folder?: string;
  processed_count?: number;
}

interface ImageConversionTranslations {
  conversionFailed: string;
  unknownError: string;
  progress: {
    converting: string;
    completed: string;
    imagesProcessed: string;
  };
}

export function useImageConversion(
  selectedItems: ImageFileItem[],
  quality: number,
  translations: ImageConversionTranslations,
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState("");
  const progressOffsetRef = useRef(0);
  const totalImagesRef = useRef(0);

  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined;
    let disposed = false;

    const registerProgressListener = async () => {
      try {
        unlistenProgress = await listen<ProgressPayload>("image-optimization-progress", (event) => {
          const payload = event.payload;
          if (payload.type === "progress") {
            setProgress({
              ...payload,
              current: progressOffsetRef.current + (payload.current ?? 0),
              total: totalImagesRef.current,
            });
          } else if (payload.type === "error") {
            setError(payload.message || translations.unknownError);
          }
        });

        if (disposed) unlistenProgress();
      } catch {
        setError(translations.unknownError);
      }
    };

    void registerProgressListener();

    return () => {
      disposed = true;
      unlistenProgress?.();
    };
  }, [translations.unknownError]);

  const convertImages = async () => {
    if (selectedItems.length === 0 || isProcessing) return;

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
    setError("");
    setProgress({ type: "progress", current: 0, total: selectedItems.length });
    totalImagesRef.current = selectedItems.length;
    progressOffsetRef.current = 0;

    let completed = 0;
    const outputFolders: string[] = [];

    try {
      for (const group of groups.values()) {
        progressOffsetRef.current = completed;
        const outputFolder = await invoke<string>("optimize_images", {
          imagePaths: group.paths,
          outputFormat: group.format,
          quality,
        });
        completed += group.paths.length;
        outputFolders.push(outputFolder);
      }

      setProgress({
        type: "success",
        processed_count: completed,
        output_folder: [...new Set(outputFolders)].join("\n"),
      });
    } catch (reason) {
      setProgress(null);
      let message =
        typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "";

      for (const item of selectedItems) {
        const separator = Math.max(item.path.lastIndexOf("/"), item.path.lastIndexOf("\\"));
        const directory = item.path.slice(0, separator);
        message = message.replaceAll(item.path, "imagen seleccionada");
        message = message.replaceAll(directory, "carpeta seleccionada");
        message = message.replaceAll(item.name, "imagen");
      }

      setError((currentError) => currentError || message || translations.conversionFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const progressMessage = (() => {
    if (!progress) return "";
    if (progress.type === "progress" && progress.current !== undefined && progress.total) {
      return translations.progress.converting
        .replace("{{current}}", progress.current.toString())
        .replace("{{total}}", progress.total.toString());
    }
    if (progress.type === "success" && progress.processed_count !== undefined) {
      return `${translations.progress.completed} ${translations.progress.imagesProcessed.replace("{{count}}", progress.processed_count.toString())}`;
    }
    return progress.message || "";
  })();

  return {
    isProcessing,
    progress,
    progressMessage,
    error,
    convertImages,
    clearError: () => setError(""),
  };
}
