"use client";

import {
  IconArrowsMove,
  IconCheck,
  IconCopy,
  IconDownload,
  IconLink,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import { usePageCover } from "@/components/pages/page-cover-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  resolveMediaDisplayUrl,
  useAssetObjectUrl,
} from "@/hooks/use-asset-object-url.ts";
import {
  copyMediaImage,
  copyMediaLink,
  downloadMedia,
} from "@/lib/media/media-actions.ts";
import { unsplashCdnUrl } from "@/lib/media/unsplash.ts";
import type { MediaProps } from "@/lib/schemas/block-props.ts";
import {
  DEFAULT_HEADER_FOCAL_Y,
  type PageHeaderImage,
} from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

interface PageCoverProps {
  className?: string;
  headerImage: PageHeaderImage | undefined;
}

/** Cover width to request from the Unsplash CDN (covers retina at full-bleed). */
const COVER_RENDER_WIDTH = 2000;

function clampFocalY(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Adapts a cover into the `MediaProps` shape the media-action helpers expect. */
function toMediaProps(headerImage: PageHeaderImage): MediaProps {
  return {
    kind: "image",
    source: headerImage.source,
    src: headerImage.src,
    alt: headerImage.alt,
  };
}

/**
 * Drag-to-reposition: while active, a vertical pointer drag on the cover maps to
 * `focalY` (0 = top, 100 = bottom). Mirrors the document-listener + rAF pattern
 * from `useMediaResize`. The image is `object-cover` (fit-to-width) so the drag
 * pans within the vertical overflow.
 */
function useCoverReposition(
  headerImage: PageHeaderImage,
  onChange: (headerImage: PageHeaderImage | null) => void
) {
  const [isRepositioning, setIsRepositioning] = useState(false);
  const [liveFocalY, setLiveFocalY] = useState<number | null>(null);

  const focalY = liveFocalY ?? headerImage.focalY ?? DEFAULT_HEADER_FOCAL_Y;

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isRepositioning) {
        return;
      }
      event.preventDefault();
      const height = event.currentTarget.clientHeight;
      if (height <= 0) {
        return;
      }

      const startY = event.clientY;
      const startFocal = headerImage.focalY ?? DEFAULT_HEADER_FOCAL_Y;
      const rafRef = { current: null as number | null };
      const pendingRef = { current: startFocal };

      // Dragging up reveals lower content → focalY increases toward the bottom.
      const compute = (clientY: number) =>
        clampFocalY(startFocal + ((startY - clientY) / height) * 100);

      const apply = (next: number) => {
        pendingRef.current = next;
        if (rafRef.current !== null) {
          return;
        }
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setLiveFocalY(pendingRef.current);
        });
      };

      const teardown = () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      };

      function onMove(moveEvent: PointerEvent) {
        apply(compute(moveEvent.clientY));
      }
      function onUp(upEvent: PointerEvent) {
        teardown();
        const next = compute(upEvent.clientY);
        setLiveFocalY(next);
        onChange({ ...headerImage, focalY: next });
      }
      function onCancel() {
        teardown();
      }

      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [headerImage, isRepositioning, onChange]
  );

  // Escape leaves reposition mode.
  useEffect(() => {
    if (!isRepositioning) {
      return;
    }
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") {
        setIsRepositioning(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRepositioning]);

  return { focalY, isRepositioning, setIsRepositioning, startDrag };
}

function ToolbarButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(active && "bg-secondary/60 text-foreground")}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            size="icon-xs"
            type="button"
            variant="overlayItem"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Full-bleed page cover image. Returns `null` when the page has no cover.
 *
 * Desktop shows a media-style hover toolbar (Change / Reposition / Download /
 * Copy / Copy link) plus a right-click menu. On touch the toolbar is hidden and
 * a long-press opens the context menu (which presents as a drawer) carrying the
 * full action list including Remove. Reposition is a drag on the image itself.
 * Unsplash photos are served sized from the CDN; attribution lives in the picker.
 */
export function PageCover({ className, headerImage }: PageCoverProps) {
  const cover = usePageCover();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const assetObjectUrl = useAssetObjectUrl(
    headerImage?.source === "asset" ? headerImage.src : undefined
  );

  const setHeaderImage = cover?.setHeaderImage ?? (() => undefined);
  const { focalY, isRepositioning, setIsRepositioning, startDrag } =
    useCoverReposition(
      headerImage ?? { source: "url", src: "" },
      setHeaderImage
    );

  if (!headerImage) {
    return null;
  }

  const displayUrl = resolveMediaDisplayUrl(
    headerImage.source,
    headerImage.src,
    assetObjectUrl
  );

  if (!displayUrl) {
    return (
      <div
        className={cn(
          "h-[26svh] max-h-72 min-h-32 w-full animate-pulse bg-muted",
          className
        )}
      />
    );
  }

  const renderUrl = unsplashCdnUrl(displayUrl, { width: COVER_RENDER_WIDTH });
  const mediaProps = toMediaProps(headerImage);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          "group/cover relative block h-[26svh] max-h-72 min-h-32 w-full select-none overflow-hidden bg-muted [-webkit-touch-callout:none]",
          className
        )}
        data-page-cover=""
        data-reveal-group=""
      >
        <div
          className={cn(
            "absolute inset-0",
            isRepositioning && "cursor-grab touch-none"
          )}
          onPointerDown={isRepositioning ? startDrag : undefined}
        >
          <img
            alt={headerImage.alt ?? ""}
            className="pointer-events-none h-full w-full select-none object-cover"
            decoding="async"
            draggable={false}
            height={480}
            src={renderUrl}
            style={{ objectPosition: `50% ${focalY}%` }}
            width={COVER_RENDER_WIDTH}
          />
        </div>

        {isRepositioning ? (
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-black/55 py-1 pr-1 pl-2.5 text-white text-xs backdrop-blur-sm">
              <span>Drag to reposition</span>
              <button
                className="rounded-full bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
                onClick={() => setIsRepositioning(false)}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}

        {/* Desktop: a media-style hover toolbar. Touch: hidden — long-press
            opens the context menu (a drawer) with the full action list. */}
        {isCoarsePrimaryPointer ? null : (
          <TooltipProvider delay={400}>
            <ButtonGroup
              aria-label="Cover actions"
              className={cn(
                "hover-reveal absolute top-3 right-3 z-20",
                isRepositioning && "opacity-100"
              )}
              onPointerDown={(event) => event.stopPropagation()}
              variant="overlay"
            >
              <ToolbarButton
                label="Change cover"
                onClick={() => cover?.openPicker()}
              >
                <IconPhoto />
              </ToolbarButton>
              <ToolbarButton
                active={isRepositioning}
                label={isRepositioning ? "Done" : "Reposition"}
                onClick={() => setIsRepositioning((value) => !value)}
              >
                {isRepositioning ? <IconCheck /> : <IconArrowsMove />}
              </ToolbarButton>
              <ToolbarButton
                label="Download"
                onClick={() => {
                  downloadMedia(mediaProps, renderUrl).catch(() => undefined);
                }}
              >
                <IconDownload />
              </ToolbarButton>
              <ToolbarButton
                label="Copy"
                onClick={() => {
                  copyMediaImage(mediaProps, renderUrl).catch(() => undefined);
                }}
              >
                <IconCopy />
              </ToolbarButton>
              <ToolbarButton
                label="Copy link"
                onClick={() => {
                  copyMediaLink(mediaProps, displayUrl).catch(() => undefined);
                }}
              >
                <IconLink />
              </ToolbarButton>
            </ButtonGroup>
          </TooltipProvider>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => cover?.openPicker()}>
          <IconPhoto />
          Change cover
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setIsRepositioning(true)}>
          <IconArrowsMove />
          Reposition
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            downloadMedia(mediaProps, renderUrl).catch(() => undefined);
          }}
        >
          <IconDownload />
          Download
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            copyMediaImage(mediaProps, renderUrl).catch(() => undefined);
          }}
        >
          <IconCopy />
          Copy image
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            copyMediaLink(mediaProps, displayUrl).catch(() => undefined);
          }}
        >
          <IconLink />
          Copy link to image
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => setHeaderImage(null)}
          variant="destructive"
        >
          <IconTrash />
          Remove cover
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
