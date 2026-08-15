"use client";

import { IconTypography } from "@tabler/icons-react";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { PageFont } from "@/lib/schemas/page-settings.ts";

const FONT_OPTIONS: Array<{
  font: PageFont;
  label: string;
  previewClassName: string;
}> = [
  { font: "default", label: "Default", previewClassName: "font-sans" },
  { font: "serif", label: "Serif", previewClassName: "font-serif" },
  { font: "mono", label: "Mono", previewClassName: "font-mono" },
];

interface PageHeaderMenuFontSubmenuProps {
  font: PageFont;
  onFontChange: (font: PageFont) => void;
}

export function PageHeaderMenuFontSubmenu({
  font,
  onFontChange,
}: PageHeaderMenuFontSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconTypography />
        Font
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            onFontChange(value as PageFont);
          }}
          value={font}
        >
          {FONT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.font} value={option.font}>
              <span className={option.previewClassName}>{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
