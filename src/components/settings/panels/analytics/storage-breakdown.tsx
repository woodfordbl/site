import { formatBytes, formatPercent } from "@/lib/format.ts";
import type {
  StorageCategory,
  StorageCategoryKey,
} from "@/lib/pages/storage-stats.ts";

const CATEGORY_COLORS: Record<StorageCategoryKey, string> = {
  assets: "var(--chart-1)",
  snapshots: "var(--chart-2)",
  blocks: "var(--chart-3)",
  activity: "var(--chart-4)",
  pages: "var(--chart-5)",
  other: "var(--muted-foreground)",
};

interface StorageBreakdownProps {
  categories: StorageCategory[];
  total: number;
}

export function StorageBreakdown({ categories, total }: StorageBreakdownProps) {
  const denominator = Math.max(1, total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {categories.map((category) => (
          <div
            key={category.key}
            style={{
              width: `${(category.bytes / denominator) * 100}%`,
              backgroundColor: CATEGORY_COLORS[category.key],
            }}
            title={`${category.label} — ${formatBytes(category.bytes)}`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {categories.map((category) => (
          <li
            className="flex items-center justify-between gap-2 text-sm"
            key={category.key}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: CATEGORY_COLORS[category.key] }}
              />
              <span className="truncate text-muted-foreground">
                {category.label}
              </span>
            </span>
            <span className="shrink-0 font-medium font-mono text-xs tabular-nums">
              {formatBytes(category.bytes)}
              <span className="ml-1.5 text-muted-foreground/70">
                {formatPercent(category.bytes / denominator)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
