import { FiChevronDown } from "react-icons/fi";

interface FormatDropdownValueProps {
  format: string;
  isOpen?: boolean;
  iconSize?: number;
}

export default function FormatDropdownValue({
  format,
  isOpen = false,
  iconSize = 24,
}: FormatDropdownValueProps) {
  return (
    <>
      <span data-format-value>{format.toUpperCase()}</span>
      <FiChevronDown
        aria-hidden="true"
        className={`chevron-icon transition-transform ${isOpen ? "rotate-180" : ""}`}
        size={iconSize}
      />
    </>
  );
}
