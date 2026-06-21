import {
  IconArrowsMaximize,
  IconCopy,
  IconDownload,
  IconLink,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  copyMediaImage,
  copyMediaLink,
  downloadMedia,
} from "@/lib/media/media-actions.ts";
import type { MediaProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

interface MediaHoverToolbarProps {
  className?: string;
  displayUrl: string;
  onView: () => void;
  props: MediaProps;
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MediaHoverToolbar({
  className,
  displayUrl,
  onView,
  props,
}: MediaHoverToolbarProps) {
  const [isActive, setIsActive] = useState(false);

  return (
    <TooltipProvider delay={400}>
      <ButtonGroup
        aria-label="Media actions"
        className={cn(
          "absolute top-2 right-2 z-20 opacity-0 transition-opacity duration-150 ease-[var(--ease-out-strong)]",
          "group-focus-within/media:opacity-100 group-hover/media:opacity-100",
          isActive && "opacity-100",
          className
        )}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setIsActive(false);
          }
        }}
        onFocusCapture={() => setIsActive(true)}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        variant="overlay"
      >
        <ToolbarButton label="View" onClick={onView}>
          <IconArrowsMaximize />
        </ToolbarButton>
        <ToolbarButton
          label="Download"
          onClick={() => {
            downloadMedia(props, displayUrl).catch(() => undefined);
          }}
        >
          <IconDownload />
        </ToolbarButton>
        <ToolbarButton
          label="Copy"
          onClick={() => {
            copyMediaImage(props, displayUrl).catch(() => undefined);
          }}
        >
          <IconCopy />
        </ToolbarButton>
        <ToolbarButton
          label="Copy link"
          onClick={() => {
            copyMediaLink(props, displayUrl).catch(() => undefined);
          }}
        >
          <IconLink />
        </ToolbarButton>
      </ButtonGroup>
    </TooltipProvider>
  );
}
