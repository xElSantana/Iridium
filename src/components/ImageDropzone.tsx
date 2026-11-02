import { memo, useEffect, useState, useMemo } from "react";
import { FiImage, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import QualityInput from "./QualityInput.tsx";
import UploadPrompt from "./UploadPrompt.tsx";
import FormatDropdown from "./FormatDropdown.tsx";
import CustomScrollArea from "./CustomScrollArea.tsx";
import { formatBytes } from "../utils/format";
import { SUPPORTED_FORMATS } from "../constants/formats";
import { useImageConversion } from "../hooks/useImageConversion";
import { useImageSelection, type ImageFileItem } from "../hooks/useImageSelection";
import { readImageQuality, saveImageQuality } from "../utils/converterPreferences";
import { useClientTranslations } from "../hooks/useClientTranslations";

interface ImageItemRowProps {
  item: ImageFileItem;
  labelConvertTo: string;
  labelRemove: string;
  onUpdateFormat: (id: string, format: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}

const ImageItemRow = memo(function ImageItemRow({
  item,
  labelConvertTo,
  labelRemove,
  onUpdateFormat,
  onRemove,
  disabled,
}: ImageItemRowProps) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="size-12 rounded-xl overflow-hidden bg-surface-subtle flex items-center justify-center shrink-0 border border-border">
          <FiImage className="text-foreground-faint" size={20} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground truncate" title={item.name}>
            {item.name}
          </p>
          <p className="text-xs text-foreground-faint font-medium">
            {item.outputSize !== undefined ? (
              <>
                <span>{formatBytes(item.size)}</span>
                <span className="mx-1">→</span>
                <span
                  className={
                    item.outputSize > item.size
                      ? "text-warning font-semibold"
                      : "text-accent font-semibold"
                  }
                >
                  {formatBytes(item.outputSize)}
                </span>
              </>
            ) : (
              formatBytes(item.size)
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-foreground-faint hidden sm:inline">{labelConvertTo}</span>
        <FormatDropdown
          value={item.format}
          formats={SUPPORTED_FORMATS}
          variant="compact"
          onChange={(format) => onUpdateFormat(item.id, format)}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={disabled}
          className="btn-remove text-foreground-faint hover:text-foreground-muted p-1.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
          title={labelRemove}
        >
          <FiX size={16} />
        </button>
      </div>
    </div>
  );
});

export default function ImageDropzone() {
  const { t, language } = useClientTranslations();
  const [quality, setQuality] = useState(60);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Memoizar las traducciones para evitar recrearlas en cada render
  const translations = useMemo(
    () => ({
      addImages: t("upload.addImages"),
      dropPrompt: t("upload.dropPrompt"),
      selectFiles: t("upload.selectFiles"),
      convertTo: t("upload.convertTo"),
      convertAll: t("upload.convertAll"),
      remove: t("upload.remove"),
      addMore: t("upload.addMore"),
      clear: t("upload.clear"),
      qualityLabel: t("upload.qualityLabel"),
      increaseQuality: t("upload.increaseQuality"),
      decreaseQuality: t("upload.decreaseQuality"),
      scrollbarLabel: t("upload.scrollbarLabel"),
      selectImagesFailed: t("upload.errors.selectImagesFailed"),
      conversionFailed: t("upload.errors.conversionFailed"),
      unknownError: t("upload.errors.unknownError"),
      selectedImage: t("upload.errors.selectedImage"),
      selectedFile: t("upload.errors.selectedFile"),
      selectedFolder: t("upload.errors.selectedFolder"),
      save: {
        dialogTitle: t("upload.save.dialogTitle"),
        imageFilter: t("upload.save.imageFilter"),
        zipFilter: t("upload.save.zipFilter"),
        zipFileName: t("upload.save.zipFileName"),
        pending: t("upload.save.pending"),
        savePending: t("upload.save.savePending"),
        discardPending: t("upload.save.discardPending"),
        cleanupPending: t("upload.save.cleanupPending"),
        retryCleanup: t("upload.save.retryCleanup"),
        completed: t("upload.save.completed"),
        failed: t("upload.save.failed"),
        backupRecoveryFailed: t("upload.save.backupRecoveryFailed"),
        discarded: t("upload.save.discarded"),
        discardFailed: t("upload.save.discardFailed"),
      },
      progress: {
        converting: t("upload.progress.converting"),
      },
    }),
    [t, language],
  );

  const {
    dropzoneRef,
    selectedItems,
    isDragging,
    error: selectionError,
    clearError: clearSelectionError,
    selectImages,
    removeItem,
    clearItems,
    updateItemFormat,
    updateItemOutputSize,
  } = useImageSelection(translations);

  useEffect(() => {
    const savedQuality = readImageQuality();
    if (savedQuality !== null) setQuality(savedQuality);
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (preferencesLoaded) saveImageQuality(quality);
  }, [preferencesLoaded, quality]);

  const {
    isProcessing,
    isSaving,
    hasPendingResults,
    hasPendingCleanup,
    savePendingResults,
    discardPendingResults,
    retryPendingCleanup,
    convertImages,
  } = useImageConversion(selectedItems, quality, translations, updateItemOutputSize);

  const handleConvert = () => {
    clearSelectionError();
    void convertImages();
  };

  return (
    <div ref={dropzoneRef} className="w-full">
      {selectedItems.length === 0 ? (
        <button
          type="button"
          id="empty-dropzone"
          onClick={selectImages}
          disabled={isProcessing}
          className={`upload-zone grid h-64 w-full cursor-pointer place-items-center rounded-2xl border border-dashed border-border-strong bg-transparent text-center outline outline-dotted outline-border-strong outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed sm:h-80 sm:rounded-3xl ${
            isDragging ? "outline-2 outline-accent" : ""
          }`}
        >
          <UploadPrompt
            addImages={translations.addImages}
            dropPrompt={translations.dropPrompt}
            selectFiles={translations.selectFiles}
          />
        </button>
      ) : (
        <div
          id="card-preview"
          className={`flex h-64 flex-col rounded-2xl border border-border bg-surface p-6 transition-all sm:h-80 sm:rounded-3xl ${
            isDragging ? "outline-2 outline-accent" : ""
          }`}
        >
          <CustomScrollArea
            className="min-h-0 flex-1"
            contentClassName="divide-y divide-border-muted pb-3"
            label={translations.scrollbarLabel}
          >
            {selectedItems.map((item) => (
              <ImageItemRow
                key={item.id}
                item={item}
                labelConvertTo={translations.convertTo}
                labelRemove={translations.remove}
                onUpdateFormat={updateItemFormat}
                onRemove={removeItem}
                disabled={isProcessing}
              />
            ))}
          </CustomScrollArea>

          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-muted pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectImages}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-border-strong rounded-full text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-colors"
              >
                <FiPlus size={14} />
                <span>{translations.addMore}</span>
              </button>
              <button
                type="button"
                onClick={clearItems}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-border-strong rounded-full text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-colors"
              >
                <FiTrash2 size={14} />
                <span>{translations.clear}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <QualityInput
                label={translations.qualityLabel}
                decreaseLabel={translations.decreaseQuality}
                increaseLabel={translations.increaseQuality}
                value={quality}
                onChange={setQuality}
                disabled={isProcessing}
              />
              <button
                type="button"
                id="btn-convert-all"
                onClick={handleConvert}
                disabled={
                  isProcessing ||
                  hasPendingResults ||
                  hasPendingCleanup ||
                  selectedItems.length === 0
                }
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-disabled text-on-accent rounded-full text-xs font-bold transition-all shadow-sm hover:shadow disabled:cursor-not-allowed cursor-pointer"
              >
                <span>
                  {translations.convertAll.replace("{{count}}", String(selectedItems.length))}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {hasPendingResults && (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="status">
          <p className="text-sm text-foreground-secondary">{translations.save.pending}</p>
          <button
            type="button"
            onClick={() => void savePendingResults()}
            disabled={isProcessing || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border-strong rounded-full text-xs font-semibold text-foreground-secondary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {translations.save.savePending}
          </button>
          <button
            type="button"
            onClick={() => void discardPendingResults()}
            disabled={isProcessing || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border-strong rounded-full text-xs font-semibold text-foreground-secondary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <FiTrash2 size={14} />
            {translations.save.discardPending}
          </button>
        </div>
      )}

      {hasPendingCleanup && (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="status">
          <p className="text-sm text-foreground-secondary">{translations.save.cleanupPending}</p>
          <button
            type="button"
            onClick={() => void retryPendingCleanup()}
            disabled={isProcessing || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border-strong rounded-full text-xs font-semibold text-foreground-secondary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {translations.save.retryCleanup}
          </button>
        </div>
      )}

      {selectionError && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {selectionError}
        </p>
      )}

      <ToastContainer position="top-center" />
    </div>
  );
}
