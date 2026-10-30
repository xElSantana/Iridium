export const SUPPORTED_FORMATS = ["JPG", "PNG", "WEBP", "AVIF", "BMP", "TIFF"] as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export const DEFAULT_OUTPUT_FORMAT: SupportedFormat = SUPPORTED_FORMATS[0];
