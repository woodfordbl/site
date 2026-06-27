function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash, 33) + input.charCodeAt(index);
    hash %= 2_147_483_647;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/** Stable hash of shipped page metadata fields used for stale detection. */
export function hashPageMetadata(fields: {
  font?: "default" | "serif" | "mono";
  fullWidth?: boolean;
  icon?: string;
  parentId: string | null;
  sidebarOrder?: number;
  slug: string;
  smallText?: boolean;
  title: string;
}): string {
  return hashString(
    stableStringify({
      font: fields.font ?? null,
      fullWidth: fields.fullWidth ?? null,
      icon: fields.icon ?? null,
      parentId: fields.parentId,
      sidebarOrder: fields.sidebarOrder ?? null,
      slug: fields.slug,
      smallText: fields.smallText ?? null,
      title: fields.title,
    })
  );
}
