const IS_WINDOWS =
  typeof navigator !== "undefined" && /windows|win32/i.test(navigator.userAgent || "");
const K_UNIT = IS_WINDOWS ? 1024 : 1000;

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(K_UNIT));
  return `${parseFloat((bytes / Math.pow(K_UNIT, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toUpperCase() || "IMG";
}
