const IS_WINDOWS =
  typeof navigator !== "undefined" && /windows|win32/i.test(navigator.userAgent || "");
const K_UNIT = IS_WINDOWS ? 1024 : 1000;
const SIZES = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const i = Math.min(SIZES.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(K_UNIT))));
  return `${parseFloat((bytes / Math.pow(K_UNIT, i)).toFixed(1))} ${SIZES[i]}`;
}
