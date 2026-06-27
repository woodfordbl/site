"use client";

import type { PageTextScale } from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

/** `null` selects "Auto" — clears the per-page override so the page follows the site default. */
const TEXT_SIZE_OPTIONS: Array<{
  label: string;
  previewClassName: string;
  value: PageTextScale | null;
}> = [
  { value: null, label: "Auto", previewClassName: "text-sm" },
  { value: "small", label: "Small", previewClassName: "text-xs" },
  { value: "default", label: "Default", previewClassName: "text-base" },
  { value: "large", label: "Large", previewClassName: "text-lg" },
];

interface PageHeaderMenuTextSizeRowProps {
  onTextScaleChange: (textScale: PageTextScale | null) => void;
  /** `undefined` means the page inherits the global site default. */
  textScale: PageTextScale | undefined;
}

export function PageHeaderMenuTextSizeRow({
  onTextScaleChange,
  textScale,
}: PageHeaderMenuTextSizeRowProps) {
  return (
    <div className="px-1 pb-1">
      <div className="grid grid-cols-4 gap-1">
        {TEXT_SIZE_OPTIONS.map((option) => {
          const selected = (textScale ?? null) === option.value;
          return (
            <button
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-center transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
              )}
              key={option.label}
              onClick={() => {
                onTextScaleChange(option.value);
              }}
              type="button"
            >
              <span className={cn("leading-none", option.previewClassName)}>
                A
              </span>
              <span className="text-xs">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
