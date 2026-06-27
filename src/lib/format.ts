const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable byte size, e.g. `1536` → `"1.5 KB"`. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  );
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`;
}

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Compact number, e.g. `12500` → `"12.5K"`. */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return compactFormatter.format(value);
}

/** Grouped integer, e.g. `12500` → `"12,500"`. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return Math.round(value).toLocaleString();
}

/** Rough reading time in minutes from a word count (200 wpm). */
export function readingMinutes(words: number): number {
  return Math.max(0, Math.round(words / 200));
}

/** `0.42` → `"42%"`. */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  if (!Number.isFinite(ratio)) {
    return "0%";
  }
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}
