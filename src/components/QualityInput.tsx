import { useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

interface QualityInputProps {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
}

export default function QualityInput({ label, decreaseLabel, increaseLabel }: QualityInputProps) {
  const [quality, setQuality] = useState(85);
  const [draft, setDraft] = useState(String(quality));

  const updateValue = (nextValue: number) => {
    const boundedValue = Math.min(100, Math.max(1, nextValue));
    setDraft(String(boundedValue));
    setQuality(boundedValue);
  };

  const handleInputChange = (nextDraft: string) => {
    setDraft(nextDraft);
    if (!/^\d+$/.test(nextDraft)) return;

    const nextValue = Number(nextDraft);
    if (nextValue >= 1 && nextValue <= 100) setQuality(nextValue);
  };

  const handleBlur = () => {
    const parsedValue = Number(draft);
    updateValue(Number.isFinite(parsedValue) ? parsedValue : quality);
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
          disabled={quality <= 1}
          onClick={() => updateValue(quality - 1)}
          className="grid size-6 cursor-pointer place-items-center rounded-l-md text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <FiChevronLeft aria-hidden="true" size={14} />
        </button>
        <input
          id="quality-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(event) => handleInputChange(event.currentTarget.value)}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              updateValue(quality + 1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              updateValue(quality - 1);
            }
          }}
          className="h-6 w-10 bg-transparent text-center text-xs leading-6 text-gray-700 focus:outline-none focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-green-600"
        />
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={quality >= 100}
          onClick={() => updateValue(quality + 1)}
          className="grid size-6 cursor-pointer place-items-center rounded-r-md text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <FiChevronRight aria-hidden="true" size={14} />
        </button>
      </div>
    </div>
  );
}
