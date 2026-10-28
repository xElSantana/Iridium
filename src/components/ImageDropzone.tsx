import { useState, useEffect, useRef } from "react";
import { FiImage, FiUpload, FiPlus, FiZap, FiX } from "react-icons/fi";
import QualityInput from "./QualityInput.tsx";
import CustomScrollArea from "./CustomScrollArea.tsx";
import { formatBytes, getFileExtension } from "../utils/format";

const FORMATS = ["JPG", "PNG", "WEBP", "AVIF"] as const;

interface ImageFileItem {
  id: string;
  file: File;
  url: string;
  format: string;
}

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
  };
}

interface ImageItemRowProps {
  item: ImageFileItem;
  loading: "eager" | "lazy";
  labelConvertTo: string;
  labelRemove: string;
  onUpdateFormat: (format: string) => void;
  onRemove: () => void;
}

function ImageItemRow({
  item,
  loading,
  labelConvertTo,
  labelRemove,
  onUpdateFormat,
  onRemove,
}: ImageItemRowProps) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="size-12 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
          <img src={item.url} alt="" className="w-full h-full object-cover" loading={loading} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate" title={item.file.name}>
            {item.file.name}
          </p>
          <p className="text-xs text-gray-400 font-medium">
            {getFileExtension(item.file.name)}, {formatBytes(item.file.size)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-400 hidden sm:inline">{labelConvertTo}</span>
        <select
          value={item.format.toLowerCase()}
          onChange={(e) => onUpdateFormat(e.target.value.toUpperCase())}
          className="format-select text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 cursor-pointer text-gray-700"
        >
          {FORMATS.map((fmt) => (
            <option key={fmt} value={fmt.toLowerCase()}>
              {fmt}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="btn-remove text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          title={labelRemove}
        >
          <FiX size={16} />
        </button>
      </div>
    </div>
  );
}

export default function ImageDropzone({ translations }: ImageDropzoneProps) {
  const [selectedItems, setSelectedItems] = useState<ImageFileItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState<string>("JPG");
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const itemsRef = useRef<ImageFileItem[]>([]);
  itemsRef.current = selectedItems;

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(
      (file) =>
        file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|bmp|tiff)$/i.test(file.name),
    );

    if (validFiles.length === 0) return;

    const newItems: ImageFileItem[] = validFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      format: globalFormat,
    }));

    setSelectedItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setSelectedItems((prev) => {
      const itemToRemove = prev.find((item) => item.id === id);
      if (itemToRemove?.url) {
        URL.revokeObjectURL(itemToRemove.url);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const updateItemFormat = (id: string, format: string) => {
    setSelectedItems((prev) => prev.map((item) => (item.id === id ? { ...item, format } : item)));
  };

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  useEffect(() => {
    const handleFormatChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ format?: string }>;
      if (customEvent.detail?.format) {
        const newFormat = customEvent.detail.format.toUpperCase();
        setGlobalFormat(newFormat);
        setSelectedItems((prev) => prev.map((item) => ({ ...item, format: newFormat })));
      }
    };

    window.addEventListener("formatChanged", handleFormatChange);
    return () => window.removeEventListener("formatChanged", handleFormatChange);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };

  return (
    <div className="w-full">
      {selectedItems.length === 0 ? (
        <label
          id="empty-dropzone"
          htmlFor="image-input"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`upload-zone grid h-64 cursor-pointer place-items-center rounded-2xl border border-dashed border-gray-300 text-center outline outline-dotted outline-gray-300 outline-offset-2 focus-within:outline-2 focus-within:outline-green-600 sm:h-80 sm:rounded-3xl ${
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
        </label>
      ) : (
        <div
          id="card-preview"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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
                onUpdateFormat={(format) => updateItemFormat(item.id, format)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </CustomScrollArea>

          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="image-input"
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-full text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <FiPlus size={14} />
                <span>{translations.addMore}</span>
              </label>
            </div>

            <QualityInput
              label={translations.qualityLabel}
              decreaseLabel={translations.decreaseQuality}
              increaseLabel={translations.increaseQuality}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-convert-all"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-full text-xs font-bold transition-all shadow-sm hover:shadow cursor-pointer"
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

      <input
        className="sr-only"
        id="image-input"
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
      />
    </div>
  );
}
