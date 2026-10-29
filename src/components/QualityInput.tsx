import { useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

interface QualityInputProps {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}

export default function QualityInput({
  label,
  decreaseLabel,
  increaseLabel,
  value,
  onChange,
  disabled,
}: QualityInputProps) {
  const [draft, setDraft] = useState(String(value));
  const valueRef = useRef(value);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipNextClickRef = useRef(false);
  valueRef.current = value;

  const stopRepeating = () => {
    if (holdTimeoutRef.current !== null) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current !== null) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  };

  const startRepeating = (change: -1 | 1, pointerId: number, currentTarget: HTMLButtonElement) => {
    if (disabled) return;

    stopRepeating();
    skipNextClickRef.current = false;
    currentTarget.setPointerCapture(pointerId);
    holdTimeoutRef.current = setTimeout(() => {
      skipNextClickRef.current = true;
      const repeat = () => {
        const nextValue = valueRef.current + change;
        if (nextValue < 1 || nextValue > 100) {
          stopRepeating();
          return;
        }
        updateValue(nextValue);
      };
      repeat();
      repeatIntervalRef.current = setInterval(repeat, 100);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current !== null) clearTimeout(holdTimeoutRef.current);
      if (repeatIntervalRef.current !== null) clearInterval(repeatIntervalRef.current);
    };
  }, []);

  const updateValue = (nextValue: number) => {
    const boundedValue = Math.min(100, Math.max(1, nextValue));
    setDraft(String(boundedValue));
    onChange(boundedValue);
  };

  const handleInputChange = (nextDraft: string) => {
    if (nextDraft === "") {
      setDraft("");
      return;
    }

    if (!/^\d+$/.test(nextDraft)) {
      setDraft(String(value));
      return;
    }

    const boundedValue = Math.min(100, Math.max(1, Number(nextDraft)));
    setDraft(String(boundedValue));
    onChange(boundedValue);
  };

  const handleBlur = () => {
    if (draft === "") {
      updateValue(value);
      return;
    }

    const parsedValue = Number(draft);
    updateValue(Number.isFinite(parsedValue) ? parsedValue : value);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="quality-input" className="text-xs font-bold text-gray-700">
        {label}
      </label>
      <div className="flex items-center rounded-md border border-gray-300">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={disabled || value <= 1}
          onPointerDown={(event) => startRepeating(-1, event.pointerId, event.currentTarget)}
          onPointerUp={stopRepeating}
          onPointerCancel={() => {
            stopRepeating();
            skipNextClickRef.current = false;
          }}
          onLostPointerCapture={stopRepeating}
          onClick={(event) => {
            if (event.detail > 0 && skipNextClickRef.current) {
              skipNextClickRef.current = false;
              return;
            }
            updateValue(value - 1);
          }}
          className="grid size-6 cursor-pointer place-items-center rounded-l-md text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <FiChevronLeft aria-hidden="true" size={14} />
        </button>
        <input
          id="quality-input"
          type="text"
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(event) => handleInputChange(event.currentTarget.value)}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              updateValue(value + 1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              updateValue(value - 1);
            }
          }}
          className="h-6 w-10 bg-transparent text-center text-xs leading-6 text-gray-700 focus:outline-none focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-green-600"
        />
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={disabled || value >= 100}
          onPointerDown={(event) => startRepeating(1, event.pointerId, event.currentTarget)}
          onPointerUp={stopRepeating}
          onPointerCancel={() => {
            stopRepeating();
            skipNextClickRef.current = false;
          }}
          onLostPointerCapture={stopRepeating}
          onClick={(event) => {
            if (event.detail > 0 && skipNextClickRef.current) {
              skipNextClickRef.current = false;
              return;
            }
            updateValue(value + 1);
          }}
          className="grid size-6 cursor-pointer place-items-center rounded-r-md text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <FiChevronRight aria-hidden="true" size={14} />
        </button>
      </div>
    </div>
  );
}
