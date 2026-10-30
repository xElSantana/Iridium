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

interface OptimizedItem {
  source_path: string;
  output_size: number;
}

interface OptimizeImagesResult {
  temporary_folder: string;
  items: OptimizedItem[];
}

interface PendingResults {
  folders: string[];
  items: OptimizedItem[];
}

interface ImageConversionTranslations {
  conversionFailed: string;
  selectedImage: string;
  selectedFile: string;
  selectedFolder: string;
  save: {
    dialogTitle: string;
    imageFilter: string;
    zipFilter: string;
    zipFileName: string;
    pending: string;
    savePending: string;
    discardPending: string;
    cleanupPending: string;
    retryCleanup: string;
    completed: string;
    failed: string;
    backupRecoveryFailed: string;
    discarded: string;
    discardFailed: string;
  };
  progress: {
    converting: string;
  };
}

export function useImageConversion(
  selectedItems: ImageFileItem[],
  quality: number,
  translations: ImageConversionTranslations,
  onItemConverted: (path: string, outputSize: number) => void,
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingResults, setPendingResults] = useState<PendingResults | null>(null);
  const [hasPendingCleanup, setHasPendingCleanup] = useState(false);
  const pendingResultsRef = useRef<PendingResults | null>(null);
  const unlistenProgressRef = useRef<UnlistenFn | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    pendingResultsRef.current = pendingResults;
  }, [pendingResults]);

  useEffect(() => {
    return () => {
      const folders = pendingResultsRef.current?.folders ?? [];
      if (folders.length > 0) {
        void invoke("discard_optimized_images", { temporaryFolders: folders }).catch(() => {
          console.error("No se pudieron eliminar los resultados temporales.");
        });
      }
    };
  }, []);

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

  const saveResults = async (results: PendingResults, toastId: string | number) => {
    setIsSaving(true);
    try {
      const saved = await invoke<boolean>("save_optimized_images", {
        temporaryFolders: results.folders,
        dialogTitle: translations.save.dialogTitle,
        imageFilter: translations.save.imageFilter,
        zipFilter: translations.save.zipFilter,
        zipFileName: translations.save.zipFileName,
      });

      if (!saved) {
        try {
          await invoke("discard_optimized_images", { temporaryFolders: results.folders });
        } catch {
          try {
            await invoke("retry_optimization_cleanup");
          } catch {
            setHasPendingCleanup(true);
          }
        }
        setPendingResults(null);
        toast.dismiss(toastId);
        return;
      }

      for (const item of results.items) {
        onItemConverted(item.source_path, item.output_size);
      }
      setPendingResults(null);
      toast.update(toastId, {
        render: translations.save.completed,
        type: "success",
        isLoading: false,
        autoClose: 2500,
        closeButton: true,
      });
    } catch (reason) {
      setPendingResults(results);
      const backupNeedsRecovery =
        reason === "IRIDIUM_BACKUP_REMAINS" ||
        (reason instanceof Error && reason.message === "IRIDIUM_BACKUP_REMAINS");
      toast.update(toastId, {
        render: backupNeedsRecovery
          ? translations.save.backupRecoveryFailed
          : translations.save.failed,
        type: "error",
        isLoading: false,
        autoClose: 3000,
        closeButton: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const savePendingResults = async () => {
    if (!pendingResults || isSaving) return;
    const toastId = toast.loading(translations.save.pending);
    await saveResults(pendingResults, toastId);
  };

  const discardPendingResults = async () => {
    if (!pendingResults || isSaving) return;
    setIsSaving(true);
    try {
      await invoke("discard_optimized_images", { temporaryFolders: pendingResults.folders });
      setPendingResults(null);
      toast.success(translations.save.discarded);
    } catch {
      toast.error(translations.save.discardFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const retryPendingCleanup = async () => {
    if (!hasPendingCleanup || isSaving) return;
    setIsSaving(true);
    try {
      await invoke("retry_optimization_cleanup");
      setHasPendingCleanup(false);
      toast.success(translations.save.discarded);
    } catch {
      toast.error(translations.save.discardFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const sanitizeConversionErrorMessage = (message: string) => {
    const replacements = new Map<string, string>();
    const uniqueDirectories = new Set<string>();

    for (const item of selectedItems) {
      const separator = Math.max(item.path.lastIndexOf("/"), item.path.lastIndexOf("\\"));
      const directory = item.path.slice(0, separator);
      uniqueDirectories.add(directory);
      replacements.set(item.path, translations.selectedImage);
      replacements.set(item.name, translations.selectedFile);
    }

    for (const directory of uniqueDirectories) {
      replacements.set(directory, translations.selectedFolder);
    }

    return Array.from(replacements.entries()).reduce(
      (sanitized, [originalValue, replacementValue]) =>
        sanitized.replaceAll(originalValue, replacementValue),
      message,
    );
  };

  const convertImages = async () => {
    if (
      selectedItems.length === 0 ||
      isProcessing ||
      pendingResults !== null ||
      hasPendingCleanup
    ) {
      return;
    }

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
    const generatedFolders: string[] = [];
    const convertedItems: OptimizedItem[] = [];

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
        generatedFolders.push(result.temporary_folder);
        convertedItems.push(...result.items);
        completed += group.paths.length;
      }

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      await saveResults({ folders: generatedFolders, items: convertedItems }, toastId);
    } catch (reason) {
      let cleanupFailed = false;
      try {
        await invoke("retry_optimization_cleanup");
      } catch {
        cleanupFailed = true;
      }
      setHasPendingCleanup(cleanupFailed);
      let message =
        typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "";
      message = sanitizeConversionErrorMessage(message);

      toast.update(toastId, {
        render: cleanupFailed
          ? `${message || translations.conversionFailed} ${translations.save.discardFailed}`
          : message || translations.conversionFailed,
        type: "error",
        isLoading: false,
        autoClose: 2000,
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
    isSaving,
    hasPendingResults: pendingResults !== null,
    hasPendingCleanup,
    savePendingResults,
    discardPendingResults,
    retryPendingCleanup,
    convertImages,
  };
}
