"use client";

import { IconFileExport, IconFileZip, IconMarkdown } from "@tabler/icons-react";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";

interface PageHeaderMenuExportSubmenuProps {
  /** Portable single-file `.md` document. */
  onExportMarkdown: () => void;
  /** Lossless `.zip` archive (page + media), re-importable via merge. */
  onExportZip: () => void;
}

export function PageHeaderMenuExportSubmenu({
  onExportMarkdown,
  onExportZip,
}: PageHeaderMenuExportSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconFileExport />
        Export
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44">
        <DropdownMenuItem onClick={onExportZip}>
          <IconFileZip />
          ZIP (.zip)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportMarkdown}>
          <IconMarkdown />
          Markdown (.md)
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
