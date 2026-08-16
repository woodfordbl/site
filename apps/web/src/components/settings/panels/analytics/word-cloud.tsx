import { useMemo } from "react";

import type { WordFrequencyEntry } from "@/lib/pages/content-stats.ts";
import { cn } from "@/lib/utils.ts";

interface WordCloudProps {
  /** How many of the top words to render. */
  limit?: number;
  words: WordFrequencyEntry[];
}

const SIZE_CLASSES = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
] as const;

function toneClass(bucket: number): string {
  if (bucket >= 3) {
    return "text-foreground";
  }
  if (bucket === 2) {
    return "text-foreground/80";
  }
  return "text-muted-foreground";
}

export function WordCloud({ words, limit = 36 }: WordCloudProps) {
  const items = useMemo(() => {
    const top = words.slice(0, limit);
    const max = Math.max(1, ...top.map((entry) => entry.count));
    const min = Math.min(...top.map((entry) => entry.count), max);
    const span = Math.max(1, max - min);
    return top.map((entry) => {
      const bucket = Math.round(
        ((entry.count - min) / span) * (SIZE_CLASSES.length - 1)
      );
      return { ...entry, bucket };
    });
  }, [words, limit]);

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        Write some pages to grow your vocabulary cloud.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      {items.map((item) => (
        <span
          className={cn(
            "font-medium leading-tight",
            SIZE_CLASSES[item.bucket],
            toneClass(item.bucket)
          )}
          key={item.word}
          title={`${item.count.toLocaleString()} uses`}
        >
          {item.word}
        </span>
      ))}
    </div>
  );
}
