import type { ReactElement } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { SourceLinkPanel } from "@/components/ui/source-link-panel.tsx";

interface EmbedSourcePickerProps {
  children: ReactElement;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (url: string) => void;
  open?: boolean;
}

export function EmbedSourcePicker({
  children,
  onOpenChange,
  onSubmit,
  open,
}: EmbedSourcePickerProps) {
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger render={children} />
      <PopoverContent className="w-80" finalFocus={false} initialFocus={false}>
        <SourceLinkPanel
          onSubmit={onSubmit}
          placeholder="Paste in https://…"
          submitLabel="Embed link"
        />
      </PopoverContent>
    </Popover>
  );
}
