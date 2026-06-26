"use client";

import type { PageFont } from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

const FONT_OPTIONS: Array<{
  font: PageFont;
  label: string;
  previewClassName: string;
}> = [
  { font: "default", label: "Default", previewClassName: "font-sans" },
  { font: "serif", label: "Serif", previewClassName: "font-serif" },
  { font: "mono", label: "Mono", previewClassName: "font-mono" },
];

interface PageHeaderMenuFontRowProps {
  font: PageFont;
  onFontChange: (font: PageFont) => void;
}

export function PageHeaderMenuFontRow({
  font,
  onFontChange,
}: PageHeaderMenuFontRowProps) {
  return (
    <div className="px-1 pb-1">
      <div className="grid grid-cols-3 gap-1">
        {FONT_OPTIONS.map((option) => {
          const selected = font === option.font;
          return (
            <button
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-center transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
              )}
              key={option.font}
              onClick={() => {
                onFontChange(option.font);
              }}
              type="button"
            >
              <span
                className={cn("text-lg leading-none", option.previewClassName)}
              >
                Ag
              </span>
              <span className="text-xs">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
