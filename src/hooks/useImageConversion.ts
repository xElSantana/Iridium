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

interface ImageConversionTranslations {
  conversionFailed: string;
  progress: {
    converting: string;
    completed: string;
    imagesProcessed: string;
    savedIn: string;
  };
}

export function useImageConversion(
  selectedItems: ImageFileItem[],
  quality: number,
  translations: ImageConversionTranslations,
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const unlistenProgressRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    return () => {
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

    try {
      unlistenProgressRef.current = await listen<ProgressPayload>(
        "image-optimization-progress",
        (event) => {
          if (event.payload.type === "progress" && event.payload.current !== undefined) {
            const current = Math.min(progressOffset + event.payload.current, totalImages);
            toast.update(toastId, {
              render: translations.progress.converting
                .replace("{{current}}", String(current))
                .replace("{{total}}", String(totalImages)),
            });
          }
        },
      );

      let completed = 0;
      const outputFolders: string[] = [];

      for (const group of groups.values()) {
        progressOffset = completed;
        const outputFolder = await invoke<string>("optimize_images", {
          imagePaths: group.paths,
          outputFormat: group.format,
          quality,
        });
        completed += group.paths.length;
        outputFolders.push(outputFolder);
      }

      const uniqueFolders = [...new Set(outputFolders)];
      const successMsg = `${translations.progress.completed} ${translations.progress.imagesProcessed.replace("{{count}}", String(completed))}`;
      const folderLines = uniqueFolders
        .map((f) => translations.progress.savedIn.replace("{{folder}}", f))
        .join("\n");
      const renderContent = folderLines ? `${successMsg}\n${folderLines}` : successMsg;

      toast.update(toastId, {
        render: renderContent,
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
        message = message.replaceAll(item.path, "imagen seleccionada");
        message = message.replaceAll(item.name, "imagen");
      }
      for (const directory of uniqueDirectories) {
        message = message.replaceAll(directory, "carpeta seleccionada");
      }

      toast.update(toastId, {
        render: message || translations.conversionFailed,
        type: "error",
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } finally {
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
