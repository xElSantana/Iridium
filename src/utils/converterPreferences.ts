import { SUPPORTED_FORMATS, type SupportedFormat } from "../constants/formats";

const OUTPUT_FORMAT_KEY = "iridium:output-format";
const IMAGE_QUALITY_KEY = "iridium:image-quality";

export function readOutputFormat(): SupportedFormat | null {
  try {
    const storedFormat = localStorage.getItem(OUTPUT_FORMAT_KEY);
    return SUPPORTED_FORMATS.find((format) => format === storedFormat) ?? null;
  } catch {
    return null;
  }
}

export function saveOutputFormat(format: string) {
  const supportedFormat = SUPPORTED_FORMATS.find((candidate) => candidate === format);
  if (!supportedFormat) return;

  try {
    localStorage.setItem(OUTPUT_FORMAT_KEY, supportedFormat);
  } catch {
    // Preferences are optional; storage errors should not block conversion.
  }
}

export function readImageQuality(): number | null {
  try {
    const storedQuality = localStorage.getItem(IMAGE_QUALITY_KEY);
    if (storedQuality === null) return null;

    const quality = Number(storedQuality);
    return Number.isInteger(quality) && quality >= 1 && quality <= 100 ? quality : null;
  } catch {
    return null;
  }
}

export function saveImageQuality(quality: number) {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) return;

  try {
    localStorage.setItem(IMAGE_QUALITY_KEY, String(quality));
  } catch {
    // Preferences are optional; storage errors should not block conversion.
  }
}
