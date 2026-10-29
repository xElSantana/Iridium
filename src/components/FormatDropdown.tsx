import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import { SUPPORTED_FORMATS } from "../constants/formats";
import { readOutputFormat } from "../utils/converterPreferences";
import { useClientTranslations } from "../hooks/useClientTranslations";

interface FormatDropdownProps {
  formats?: readonly string[];
  value?: string;
  defaultValue?: string;
  variant?: "header" | "compact";
  disabled?: boolean;
  broadcastFormatChange?: boolean;
  onChange?: (format: string) => void;
}

interface DropdownCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

export default function FormatDropdown({
  formats = SUPPORTED_FORMATS,
  value,
  defaultValue = "JPG",
  variant = "header",
  disabled = false,
  broadcastFormatChange = false,
  onChange,
}: FormatDropdownProps) {
  const { t } = useClientTranslations();
  const label = t("converter.selectFormat");
  const [internalValue, setInternalValue] = useState(() => {
    if (!broadcastFormatChange || typeof window === "undefined") return defaultValue;
    return readOutputFormat() ?? defaultValue;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<DropdownCoords | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const format = value ?? internalValue;
  const isHeader = variant === "header";

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(formats.length * 32 + 10, 200);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    if (openUp) {
      setCoords({
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
      });
    } else {
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  const toggleDropdown = () => {
    if (!isOpen && !isHeader) {
      updateCoords();
    }
    setIsOpen((open) => !open);
  };

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
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
      if (!isHeader) {
        updateCoords();
      }
      setIsOpen(true);
      requestAnimationFrame(() => {
        const options = (
          menuRef.current ?? containerRef.current
        )?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']");
        const target = event.key === "ArrowUp" ? options?.[options.length - 1] : options?.[0];
        target?.focus();
      });
      return;
    }

    const options = Array.from(
      (menuRef.current ?? containerRef.current)?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitemradio']",
      ) ?? [],
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
        onClick={toggleDropdown}
        className={
          isHeader
            ? "inline-flex w-44 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-4xl font-extrabold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover disabled:cursor-not-allowed disabled:opacity-50 [&[aria-expanded=true]_.chevron-icon]:rotate-180"
            : "flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-xs font-semibold text-foreground-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground-muted disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <span>{format.toUpperCase()}</span>
        <FiChevronDown
          aria-hidden="true"
          className={`chevron-icon transition-transform ${isOpen ? "rotate-180" : ""}`}
          size={isHeader ? 24 : 14}
        />
      </button>

      {isOpen && isHeader && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-full rounded-lg border-2 border-border bg-surface py-1 shadow-lg"
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
                className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left font-semibold text-foreground hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none gap-4 text-lg"
              >
                <span>{option}</span>
                {isSelected && (
                  <FiCheck aria-hidden="true" className="text-accent-soft" size={20} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {isOpen &&
        !isHeader &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 9999,
            }}
            className="rounded-lg border border-border bg-surface py-1 shadow-lg max-h-48 overflow-y-auto"
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
                  className="flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-left font-semibold text-foreground hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none gap-2 text-xs"
                >
                  <span>{option}</span>
                  {isSelected && (
                    <FiCheck aria-hidden="true" className="text-accent-soft" size={14} />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
