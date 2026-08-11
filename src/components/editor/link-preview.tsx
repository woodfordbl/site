"use client";

import { IconWorld } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  usePrefetchUrlPreview,
  useUrlPreview,
} from "@/hooks/use-url-preview.ts";
import type { UrlPreview } from "@/lib/media/parse-url-preview.ts";
import { urlPreviewQueryKey } from "@/lib/media/url-preview-query.ts";
import { warmUrlPreviewAssets } from "@/lib/media/warm-url-preview-assets.ts";
import { cn } from "@/lib/utils.ts";

/** Anti-flyover delay when OG is already cached (idle warm / prior hover). */
export const LINK_PREVIEW_OPEN_DELAY_CACHED_MS = 120;
/** Open delay when the cache is cold; prefetch starts immediately on enter. */
export const LINK_PREVIEW_OPEN_DELAY_COLD_MS = 280;
/** Grace period when leaving the link before closing (allows moving to popover). */
export const LINK_PREVIEW_CLOSE_DELAY_MS = 150;

/**
 * Compact 16:9 OG thumbnail inside the 272px horizontal card.
 * Height matches the prior 48px rhythm; width ≈ 48 × 16/9.
 */
export const LINK_PREVIEW_MEDIA_WIDTH_PX = 85;
export const LINK_PREVIEW_MEDIA_HEIGHT_PX = 48;
export const LINK_PREVIEW_MEDIA_FRAME_CLASSNAME =
  "relative h-12 w-[85px] shrink-0 overflow-hidden rounded-md bg-muted";

const WWW_PREFIX_REGEX = /^www\./;

function previewHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX_REGEX, "");
  } catch {
    return url;
  }
}

/**
 * Domain row link — opens the URL without stealing editor focus.
 * `mousedown` preventDefault keeps caret/selection in the field; click still
 * navigates (new tab).
 */
function LinkPreviewDomainLink({
  className,
  hostname,
  url,
}: {
  className?: string;
  hostname: string;
  url: string;
}) {
  return (
    <a
      className={cn(
        "min-w-0 truncate text-primary underline-offset-2 hover:underline",
        className
      )}
      href={url}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      rel="noopener noreferrer"
      target="_blank"
      title={url}
    >
      {hostname}
    </a>
  );
}

function LinkPreviewMediaSlot({
  faviconUrl,
  imageUrl,
}: {
  faviconUrl?: string;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      <div
        className={LINK_PREVIEW_MEDIA_FRAME_CLASSNAME}
        data-slot="link-preview-media"
      >
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          height={LINK_PREVIEW_MEDIA_HEIGHT_PX}
          loading="eager"
          src={imageUrl}
          width={LINK_PREVIEW_MEDIA_WIDTH_PX}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        LINK_PREVIEW_MEDIA_FRAME_CLASSNAME,
        "flex items-center justify-center text-muted-foreground"
      )}
      data-slot="link-preview-media"
    >
      {faviconUrl ? (
        <img
          alt=""
          className="size-5 rounded-sm object-contain"
          decoding="async"
          height={20}
          loading="eager"
          src={faviconUrl}
          width={20}
        />
      ) : (
        <IconWorld className="size-4 stroke-[1.5px]" />
      )}
    </div>
  );
}

/**
 * Presentational OG card body (loading / error / success). Exported for DOM
 * tests of media frame, domain link, and title clamp geometry.
 */
export function LinkPreviewCard({
  hostname,
  preview,
  status,
  url,
}: {
  hostname: string;
  preview?: UrlPreview | null;
  status: "pending" | "error" | "success";
  url: string;
}) {
  if (status === "pending") {
    return (
      <div className="flex items-start gap-2">
        <Skeleton
          className={LINK_PREVIEW_MEDIA_FRAME_CLASSNAME}
          data-slot="link-preview-media-skeleton"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-w-0 items-center gap-1.5 px-0.5 text-xs">
        <IconWorld className="size-3 shrink-0 stroke-[1.5px] text-muted-foreground" />
        <LinkPreviewDomainLink hostname={hostname} url={url} />
      </div>
    );
  }

  const title = preview?.title?.trim() || hostname;
  const imageUrl = preview?.imageUrl?.trim();
  const faviconUrl = preview?.faviconUrl?.trim();

  return (
    <div className="flex items-start gap-2">
      <LinkPreviewMediaSlot faviconUrl={faviconUrl} imageUrl={imageUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
        <p
          className="line-clamp-2 min-w-0 overflow-hidden font-normal text-xs leading-snug"
          data-slot="link-preview-title"
          title={title}
        >
          {title}
        </p>
        <div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground leading-none">
          {imageUrl && faviconUrl ? (
            <img
              alt=""
              className="size-2.5 shrink-0 rounded-sm"
              decoding="async"
              height={10}
              loading="eager"
              src={faviconUrl}
              width={10}
            />
          ) : null}
          {imageUrl && !faviconUrl ? (
            <IconWorld className="size-2.5 shrink-0 stroke-[1.5px]" />
          ) : null}
          <LinkPreviewDomainLink hostname={hostname} url={url} />
        </div>
      </div>
    </div>
  );
}

function linkPreviewStatus(args: {
  isError: boolean;
  isPending: boolean;
}): "pending" | "error" | "success" {
  if (args.isPending) {
    return "pending";
  }
  if (args.isError) {
    return "error";
  }
  return "success";
}

function LinkPreviewBody({ enabled, url }: { enabled: boolean; url: string }) {
  const { data, isError, isPending } = useUrlPreview(url, enabled);
  const hostname = previewHostname(url);

  return (
    <LinkPreviewCard
      hostname={hostname}
      preview={data}
      status={linkPreviewStatus({ isError, isPending })}
      url={url}
    />
  );
}

interface LinkPreviewPopoverProps {
  anchor: HTMLElement | null;
  onCloseDelay: () => void;
  onOpenStay: () => void;
  open: boolean;
  url: string;
}

function LinkPreviewPopover({
  anchor,
  onCloseDelay,
  onOpenStay,
  open,
  url,
}: LinkPreviewPopoverProps) {
  return (
    <Popover modal={false} open={open}>
      <PopoverContent
        align="start"
        anchor={anchor}
        className="w-[272px] gap-0 p-1.5"
        finalFocus={false}
        initialFocus={false}
        onPointerEnter={onOpenStay}
        onPointerLeave={onCloseDelay}
        side="top"
        sideOffset={6}
      >
        <LinkPreviewBody enabled={open} url={url} />
      </PopoverContent>
    </Popover>
  );
}

function useLinkPreviewHoverControllers(enabled: boolean) {
  const queryClient = useQueryClient();
  const prefetch = usePrefetchUrlPreview();
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [url, setUrl] = useState("");

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeNow = useCallback(() => {
    clearTimers();
    setOpen(false);
    setAnchor(null);
    setUrl("");
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
      setAnchor(null);
      setUrl("");
    }, LINK_PREVIEW_CLOSE_DELAY_MS);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(
    (nextAnchor: HTMLElement, href: string) => {
      if (!(enabled && href)) {
        return;
      }
      cancelClose();
      if (openTimerRef.current !== null) {
        clearTimeout(openTimerRef.current);
      }

      const cached = queryClient.getQueryData<UrlPreview>(
        urlPreviewQueryKey(href)
      );
      if (cached) {
        warmUrlPreviewAssets(cached);
      } else {
        prefetch(href);
      }

      const openDelay = cached
        ? LINK_PREVIEW_OPEN_DELAY_CACHED_MS
        : LINK_PREVIEW_OPEN_DELAY_COLD_MS;

      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setAnchor(nextAnchor);
        setUrl(href);
        setOpen(true);
      }, openDelay);
    },
    [cancelClose, enabled, prefetch, queryClient]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    anchor,
    cancelClose,
    closeNow,
    open,
    scheduleClose,
    scheduleOpen,
    url,
  };
}

interface InlineLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
}

/**
 * Read-only rich-text link with hover OG preview (design-system Popover).
 * Click still navigates; preview never steals focus.
 */
export function InlineLink({ children, className, href }: InlineLinkProps) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const hoverEnabled = !isCoarsePointer;
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const { anchor, cancelClose, open, scheduleClose, scheduleOpen, url } =
    useLinkPreviewHoverControllers(hoverEnabled);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLAnchorElement>) => {
      if (event.pointerType !== "mouse" || !hoverEnabled) {
        return;
      }
      const el = event.currentTarget;
      scheduleOpen(el, href);
    },
    [hoverEnabled, href, scheduleOpen]
  );

  return (
    <>
      <a
        className={className}
        href={href}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={() => {
          if (hoverEnabled) {
            scheduleClose();
          }
        }}
        ref={anchorRef}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
      {hoverEnabled && url ? (
        <LinkPreviewPopover
          anchor={open ? (anchor ?? anchorRef.current) : null}
          onCloseDelay={scheduleClose}
          onOpenStay={cancelClose}
          open={open}
          url={url}
        />
      ) : null}
    </>
  );
}

function resolveHoveredLinkAnchor(
  target: EventTarget | null,
  root: HTMLElement
): HTMLAnchorElement | null {
  if (!(target instanceof Element && root.contains(target))) {
    return null;
  }
  const anchor = target.closest("a[href], a[data-href]");
  if (!(anchor instanceof HTMLAnchorElement && root.contains(anchor))) {
    return null;
  }
  return anchor;
}

function hrefFromAnchor(anchor: HTMLAnchorElement): string {
  return (anchor.dataset.href ?? anchor.getAttribute("href") ?? "").trim();
}

/**
 * Hover OG preview for links inside a contenteditable rich-text field.
 * Event-delegated so caret/selection stay with the field; `modal={false}` and
 * `initialFocus={false}` keep focus on the editor. Skipped while text is
 * selected so drag-select does not open the popover.
 */
export function EditableInlineLinkPreview({
  fieldRef,
}: {
  fieldRef: RefObject<HTMLElement | null>;
}) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const hoverEnabled = !isCoarsePointer;
  const {
    anchor,
    cancelClose,
    closeNow,
    open,
    scheduleClose,
    scheduleOpen,
    url,
  } = useLinkPreviewHoverControllers(hoverEnabled);

  useEffect(() => {
    const root = fieldRef.current;
    if (!(root && hoverEnabled)) {
      return;
    }

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const next = resolveHoveredLinkAnchor(event.target, root);
      if (!next) {
        return;
      }
      if (next.dataset.pageId) {
        return;
      }
      const related = event.relatedTarget;
      if (related instanceof Node && next.contains(related)) {
        return;
      }
      const selection = root.ownerDocument.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        root.contains(selection.anchorNode)
      ) {
        return;
      }
      const href = hrefFromAnchor(next);
      if (!href) {
        return;
      }
      scheduleOpen(next, href);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const leaving = resolveHoveredLinkAnchor(event.target, root);
      if (!leaving) {
        return;
      }
      const related = event.relatedTarget;
      if (related instanceof Node && leaving.contains(related)) {
        return;
      }
      scheduleClose();
    };

    const onPointerDown = () => {
      closeNow();
    };

    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("pointerdown", onPointerDown);
    return () => {
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeNow, fieldRef, hoverEnabled, scheduleClose, scheduleOpen]);

  if (!(hoverEnabled && url)) {
    return null;
  }

  return (
    <LinkPreviewPopover
      anchor={open ? anchor : null}
      onCloseDelay={scheduleClose}
      onOpenStay={cancelClose}
      open={open}
      url={url}
    />
  );
}
