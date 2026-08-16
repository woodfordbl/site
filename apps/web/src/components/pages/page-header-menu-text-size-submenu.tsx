"use client";

import { IconTextSize } from "@tabler/icons-react";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { PageTextScale } from "@/lib/schemas/page-settings.ts";

/** Sentinel value for "follow the site default" (clears the per-page override). */
const AUTO_VALUE = "auto";

const TEXT_SIZE_OPTIONS: Array<{ label: string; value: string }> = [
  { value: AUTO_VALUE, label: "Use site default" },
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

interface PageHeaderMenuTextSizeSubmenuProps {
  onTextScaleChange: (textScale: PageTextScale | null) => void;
  /** `undefined` means the page inherits the global site default. */
  textScale: PageTextScale | undefined;
}

export function PageHeaderMenuTextSizeSubmenu({
  onTextScaleChange,
  textScale,
}: PageHeaderMenuTextSizeSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconTextSize />
        Text size
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            onTextScaleChange(
              value === AUTO_VALUE ? null : (value as PageTextScale)
            );
          }}
          value={textScale ?? AUTO_VALUE}
        >
          {TEXT_SIZE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
