import { memo, useState } from "react";
import { FiImage, FiUpload, FiPlus, FiZap, FiX } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import QualityInput from "./QualityInput.tsx";
import CustomScrollArea from "./CustomScrollArea.tsx";
import { formatBytes } from "../utils/format";
import { SUPPORTED_FORMATS } from "../constants/formats";
import { useImageConversion } from "../hooks/useImageConversion";
import { useImageSelection, type ImageFileItem } from "../hooks/useImageSelection";

interface ImageDropzoneProps {
  translations: {
    addImages: string;
    dropPrompt: string;
    selectFiles: string;
    convertTo: string;
    convertAll: string;
    remove: string;
    addMore: string;
    qualityLabel: string;
    increaseQuality: string;
    decreaseQuality: string;
    scrollbarLabel: string;
    selectImagesFailed: string;
    conversionFailed: string;
    unknownError: string;
    progress: {
      converting: string;
      completed: string;
      imagesProcessed: string;
      savedIn: string;
    };
  };
}

interface ImageItemRowProps {
  item: ImageFileItem;
  loading: "eager" | "lazy";
  labelConvertTo: string;
  labelRemove: string;
  onUpdateFormat: (id: string, format: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}

const ImageItemRow = memo(function ImageItemRow({
  item,
  loading,
  labelConvertTo,
  labelRemove,
  onUpdateFormat,
  onRemove,
  disabled,
}: ImageItemRowProps) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="size-12 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
          <img src={item.url} alt="" className="w-full h-full object-cover" loading={loading} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate" title={item.name}>
            {item.name}
          </p>
          <p className="text-xs text-gray-400 font-medium">{formatBytes(item.size)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-400 hidden sm:inline">{labelConvertTo}</span>
        <select
          value={item.format.toLowerCase()}
          onChange={(e) => onUpdateFormat(item.id, e.target.value.toUpperCase())}
          disabled={disabled}
          className="format-select text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 cursor-pointer text-gray-700"
        >
          {SUPPORTED_FORMATS.map((fmt) => (
            <option key={fmt} value={fmt.toLowerCase()}>
              {fmt}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={disabled}
          className="btn-remove text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          title={labelRemove}
        >
          <FiX size={16} />
        </button>
      </div>
    </div>
  );
});

export default function ImageDropzone({ translations }: ImageDropzoneProps) {
  const [quality, setQuality] = useState(85);
  const {
    dropzoneRef,
    selectedItems,
    isDragging,
    error: selectionError,
    clearError: clearSelectionError,
    selectImages,
    removeItem,
    updateItemFormat,
  } = useImageSelection(translations);
  const { isProcessing, convertImages } = useImageConversion(selectedItems, quality, translations);

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
          className={`upload-zone grid h-64 w-full cursor-pointer place-items-center rounded-2xl border border-dashed border-gray-300 bg-transparent text-center outline outline-dotted outline-gray-300 outline-offset-2 focus-visible:outline-2 focus-visible:outline-green-600 disabled:cursor-not-allowed sm:h-80 sm:rounded-3xl ${
            isDragging ? "outline-2 outline-green-600" : ""
          }`}
        >
          <span className="flex flex-col items-center p-6">
            <span
              className="relative mb-2 grid h-12 w-16 place-items-center text-gray-400"
              aria-hidden="true"
            >
              <FiImage size={42} />
              <span className="absolute bottom-0 -right-1 grid size-6 place-items-center rounded-full bg-green-600 text-white">
                <FiUpload size={15} />
              </span>
            </span>
            <span className="text-base font-bold text-gray-900">{translations.addImages}</span>
            <span className="mt-1.5 text-xs text-gray-500">
              {translations.dropPrompt}{" "}
              <span className="font-bold text-green-600">{translations.selectFiles}</span>
            </span>
          </span>
        </button>
      ) : (
        <div
          id="card-preview"
          className={`flex h-64 flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all sm:h-80 sm:rounded-3xl ${
            isDragging ? "outline-2 outline-green-600" : ""
          }`}
        >
          <CustomScrollArea
            className="min-h-0 flex-1"
            contentClassName="divide-y divide-gray-100 pb-3"
            label={translations.scrollbarLabel}
          >
            {selectedItems.map((item, index) => (
              <ImageItemRow
                key={item.id}
                item={item}
                loading={index === 0 ? "eager" : "lazy"}
                labelConvertTo={translations.convertTo}
                labelRemove={translations.remove}
                onUpdateFormat={updateItemFormat}
                onRemove={removeItem}
                disabled={isProcessing}
              />
            ))}
          </CustomScrollArea>

          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectImages}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-full text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-colors"
              >
                <FiPlus size={14} />
                <span>{translations.addMore}</span>
              </button>
            </div>

            <QualityInput
              label={translations.qualityLabel}
              decreaseLabel={translations.decreaseQuality}
              increaseLabel={translations.increaseQuality}
              value={quality}
              onChange={setQuality}
              disabled={isProcessing}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-convert-all"
                onClick={handleConvert}
                disabled={isProcessing || selectedItems.length === 0}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-full text-xs font-bold transition-all shadow-sm hover:shadow disabled:cursor-not-allowed cursor-pointer"
              >
                <FiZap size={14} />
                <span>
                  {translations.convertAll.replace("{{count}}", String(selectedItems.length))}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectionError && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {selectionError}
        </p>
      )}

      <ToastContainer position="top-center" />
    </div>
  );
}
