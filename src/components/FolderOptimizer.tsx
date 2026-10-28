import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FaFolder, FaImages, FaCheckCircle, FaSpinner } from "react-icons/fa";

const PREVIEW_LIMIT = 12;

interface ProgressPayload {
  type: "progress" | "error" | "success";
  current?: number;
  total?: number;
  message?: string;
  output_folder?: string;
  processed_count?: number;
}

interface FolderOptimizerProps {
  translations: {
    selectFolder: string;
    selectedFolder: string;
    optimize: string;
    processing: string;
    selectFolderFirst: string;
    formats: {
      label: string;
      webp: string;
      avif: string;
      jpg: string;
      png: string;
    };
    quality: {
      label: string;
      value: string;
    };
    progress: {
      optimizing: string;
      completed: string;
      imagesProcessed: string;
      savedIn: string;
    };
    errors: {
      noFolder: string;
      optimizationFailed: string;
      unknownError: string;
      loadPreviewFailed: string;
    };
    preview: {
      totalImages: string;
      showing: string;
    };
  };
}

export default function FolderOptimizer({ translations }: FolderOptimizerProps) {
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [outputFormat, setOutputFormat] = useState<string>("webp");
  const [quality, setQuality] = useState<number>(85);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [previewPaths, setPreviewPaths] = useState<string[]>([]);
  const [totalImages, setTotalImages] = useState<number>(0);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<ProgressPayload>("image-optimization-progress", (event) => {
      setProgress(event.payload);

      if (event.payload.type === "error") {
        setError(event.payload.message || translations.errors.unknownError);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [translations.errors.unknownError]);

  const loadFolderPreview = async (folderPath: string) => {
    try {
      const paths = await invoke<string[]>("list_folder_images", { folderPath });
      setTotalImages(paths.length);
      setPreviewPaths(paths.slice(0, PREVIEW_LIMIT).map((p) => convertFileSrc(p)));
    } catch {
      setError(translations.errors.loadPreviewFailed);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const folder = await invoke<string>("select_folder");
      setSelectedFolder(folder);
      setError("");
      setProgress(null);
      setPreviewPaths([]);
      setTotalImages(0);
      await loadFolderPreview(folder);
    } catch {
      setError(translations.errors.noFolder);
    }
  };

  const handleOptimize = async () => {
    if (!selectedFolder) {
      setError(translations.selectFolderFirst);
      return;
    }

    setIsProcessing(true);
    setError("");
    setProgress(null);

    try {
      await invoke("optimize_images", {
        folderPath: selectedFolder,
        outputFormat,
        quality,
      });
      setIsProcessing(false);
    } catch {
      setError((currentError) => currentError || translations.errors.optimizationFailed);
      setIsProcessing(false);
    }
  };

  const getProgressMessage = () => {
    if (!progress) return "";

    if (progress.type === "progress" && progress.current && progress.total) {
      return translations.progress.optimizing
        .replace("{{current}}", progress.current.toString())
        .replace("{{total}}", progress.total.toString());
    }

    if (progress.type === "success" && progress.processed_count) {
      return `${translations.progress.completed} ${translations.progress.imagesProcessed.replace("{{count}}", progress.processed_count.toString())}`;
    }

    return progress.message || "";
  };

  const previewCountLabel =
    totalImages > PREVIEW_LIMIT
      ? translations.preview.showing
          .replace("{{shown}}", PREVIEW_LIMIT.toString())
          .replace("{{total}}", totalImages.toString())
      : translations.preview.totalImages.replace("{{count}}", totalImages.toString());

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        {/* Selección de carpeta */}
        <div className="mb-8">
          <button
            onClick={handleSelectFolder}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors"
          >
            <FaFolder className="text-xl" />
            {translations.selectFolder}
          </button>

          {selectedFolder && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{translations.selectedFolder}</p>
              <p className="text-sm font-mono text-gray-800 break-all">{selectedFolder}</p>
            </div>
          )}

          {/* Panel de preview de miniaturas */}
          {previewPaths.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">{previewCountLabel}</p>
              <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {previewPaths.map((src, i) => (
                  <div key={i} className="aspect-square rounded-md overflow-hidden bg-gray-200">
                    <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Configuración */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Formato de salida */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {translations.formats.label}
            </label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              disabled={isProcessing}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="webp">{translations.formats.webp}</option>
              <option value="avif">{translations.formats.avif}</option>
              <option value="jpg">{translations.formats.jpg}</option>
              <option value="png">{translations.formats.png}</option>
            </select>
          </div>

          {/* Calidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {translations.quality.label}:{" "}
              {translations.quality.value.replace("{{value}}", quality.toString())}
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              disabled={isProcessing}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Botón de optimización */}
        <button
          onClick={handleOptimize}
          disabled={!selectedFolder || isProcessing}
          className="w-full flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors mb-6"
        >
          {isProcessing ? (
            <>
              <FaSpinner className="text-xl animate-spin" />
              {translations.processing}
            </>
          ) : (
            <>
              <FaImages className="text-xl" />
              {translations.optimize}
            </>
          )}
        </button>

        {/* Progreso */}
        {progress && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              {progress.type === "success" ? (
                <FaCheckCircle className="text-green-600 text-xl mt-1" />
              ) : (
                <FaSpinner className="text-blue-600 text-xl mt-1 animate-spin" />
              )}
              <div className="flex-1">
                <p className="font-medium text-gray-800">{getProgressMessage()}</p>

                {progress.type === "success" && progress.output_folder && (
                  <p className="text-sm text-gray-600 mt-2 break-all">
                    {translations.progress.savedIn.replace("{{folder}}", progress.output_folder)}
                  </p>
                )}

                {progress.type === "progress" && progress.current && progress.total && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {progress.current} / {progress.total}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-red-800">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
