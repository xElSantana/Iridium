export const SUPPORTED_FORMATS = ["JPG", "PNG", "WEBP", "AVIF", "BMP", "TIFF"] as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];
