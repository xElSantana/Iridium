import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import { SUPPORTED_FORMATS } from "../constants/formats";

interface FormatDropdownProps {
  formats?: readonly string[];
  value?: string;
  defaultValue?: string;
  label: string;
  variant?: "header" | "compact";
  disabled?: boolean;
  broadcastFormatChange?: boolean;
  onChange?: (format: string) => void;
}

export default function FormatDropdown({
  formats = SUPPORTED_FORMATS,
  value,
  defaultValue = "JPG",
  label,
  variant = "header",
  disabled = false,
  broadcastFormatChange = false,
  onChange,
}: FormatDropdownProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const format = value ?? internalValue;
  const isHeader = variant === "header";

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    if (!isOpen) {
      setIsOpen(true);
      requestAnimationFrame(() => {
        const options =
          containerRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']");
        const target = event.key === "ArrowUp" ? options?.[options.length - 1] : options?.[0];
        target?.focus();
      });
      return;
    }

    const options = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? [],
    );
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;

    options[nextIndex]?.focus();
  };

  const selectFormat = (nextFormat: string) => {
    if (value === undefined) setInternalValue(nextFormat);
    onChange?.(nextFormat);

    if (broadcastFormatChange) {
      window.dispatchEvent(
        new CustomEvent("formatChanged", {
          detail: { format: nextFormat.toLowerCase() },
        }),
      );
    }

    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${isHeader ? "" : "w-24"}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${label}: ${format}`}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={
          isHeader
            ? "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-4xl font-extrabold text-white transition-colors hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-not-allowed disabled:opacity-50 [&[aria-expanded=true]_.chevron-icon]:rotate-180"
            : "flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <span>{format.toUpperCase()}</span>
        <FiChevronDown
          aria-hidden="true"
          className={`chevron-icon transition-transform ${isOpen ? "rotate-180" : ""}`}
          size={isHeader ? 24 : 14}
        />
      </button>
      {isOpen && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${isHeader ? "left-0 mt-2 border-2" : "left-0"}`}
        >
          {formats.map((option) => {
            const isSelected = option.toUpperCase() === format.toUpperCase();
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => selectFormat(option)}
                className={`flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-left font-semibold text-gray-900 hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none ${isHeader ? "gap-4 px-4 py-3 text-lg" : "gap-2 text-xs"}`}
              >
                <span>{option}</span>
                {isSelected && (
                  <FiCheck
                    aria-hidden="true"
                    className={isHeader ? "text-green-500" : "text-green-500"}
                    size={isHeader ? 20 : 14}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
