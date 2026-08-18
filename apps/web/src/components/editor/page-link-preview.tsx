"use client";

import { IconFileAlert } from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PreviewChipIcon,
  PreviewLine,
} from "@/components/editor/page-link-preview-line.tsx";
import { useIsCoarsePrimaryPointer } from "@/components/layout/device-layout-provider.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { useDelegatedLinkHover } from "@/hooks/use-delegated-link-hover.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import { sitePagesQueryOptions } from "@/lib/content/site-pages-query.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import {
  HOVER_PREVIEW_CLOSE_DELAY_MS,
  HOVER_PREVIEW_OPEN_DELAY_CACHED_MS,
} from "@/lib/editor/hover-preview-timing.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import {
  buildPageLinkPreviewBody,
  type PageLinkPreviewBody,
} from "@/lib/pages/page-link-preview-model.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import type { DatabaseRowSource } from "@/lib/schemas/local-page.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Hover card for an inline page link: the linked page's identity (cover, icon,
 * title), the properties that distinguish it if it is a database row, and the
 * first few lines of its body.
 *
 * Sized by what a reader can take in mid-sentence without losing their place,
 * not by what fits: 320x240, and a body that stops at
 * `PAGE_LINK_PREVIEW_LINE_LIMIT` lines and says how many it withheld.
 */

const PAGE_LINK_PREVIEW_WIDTH_PX = 320;
const PAGE_LINK_PREVIEW_WIDTH_CLASSNAME = "w-[320px]";
const PAGE_LINK_PREVIEW_MAX_HEIGHT_CLASSNAME = "max-h-[240px]";

/** Properties shown before the rest fall to the row page itself. */
const ROW_PROPERTY_LIMIT = 3;

/**
 * Chrome takes 146px of the card when a row page has both a cover and
 * properties, leaving about four body lines. The cover is the least
 * identifying of the three, so it is the one that yields.
 */
const COVER_HEIGHT_PX = 48;
const COVER_HEIGHT_CLASSNAME = "h-12";

function PropertyValue({
  field,
  value,
}: {
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
}) {
  if (field.type === "select" || field.type === "multiSelect") {
    const ids = Array.isArray(value) ? value : [value];
    const chips = field.options.filter((option) =>
      ids.includes(option.id as never)
    );
    if (chips.length === 0) {
      return <span className="text-muted-foreground">Empty</span>;
    }
    return (
      <span className="flex min-w-0 items-center gap-1">
        {chips.map((option) => (
          <span
            className={cn(
              "shrink-0 rounded-[3px] bg-muted px-1 text-[10px] leading-3.5",
              option.color
                ? BLOCK_COLOR_DEFS[option.color].textClass
                : "text-muted-foreground"
            )}
            key={option.id}
          >
            {option.name}
          </span>
        ))}
      </span>
    );
  }

  const text = formatCellValue(field, value);
  return text === "" ? (
    <span className="text-muted-foreground">Empty</span>
  ) : (
    <span className="truncate">{text}</span>
  );
}

/** The row's own fields — what distinguishes this row from its siblings. */
function PreviewProperties({
  fields,
  values,
}: {
  fields: readonly DatabaseField[];
  values: Record<string, DatabaseCellValue>;
}) {
  return (
    <div className="mx-2.5 mb-1 shrink-0 rounded-md border border-border px-2 py-0.5">
      {fields.map((field) => (
        <div
          className="grid h-5 grid-cols-[66px_minmax(0,1fr)] items-center gap-2"
          key={field.id}
        >
          <span className="truncate text-[10px] text-muted-foreground">
            {field.name}
          </span>
          <span className="flex min-w-0 items-center text-[11px] text-foreground/80">
            <PropertyValue field={field} value={values[field.id]} />
          </span>
        </div>
      ))}
    </div>
  );
}

interface RowProperties {
  fields: readonly DatabaseField[];
  values: Record<string, DatabaseCellValue>;
}

const NO_ROW_PROPERTIES: RowProperties = { fields: [], values: {} };

function useRowProperties(
  rowSource: DatabaseRowSource | undefined
): RowProperties {
  const databaseId = rowSource?.databaseId ?? "";
  const rowId = rowSource?.rowId ?? "";

  const { data: databases = [] } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const { data: rows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.id, rowId)),
    [rowId]
  );

  const database = databases[0];
  const row = rows[0];

  return useMemo(() => {
    if (!(database && row)) {
      return NO_ROW_PROPERTIES;
    }
    return {
      // The primary field is the row's title, already shown in the header.
      fields: database.fields.slice(1, 1 + ROW_PROPERTY_LIMIT),
      values: row.values,
    };
  }, [database, row]);
}

function PreviewHeader({ icon, title }: { icon?: string; title: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-2 pb-1">
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.5px] **:[[role=img]]:text-[13px]">
        <PageIconDisplay icon={icon} />
      </span>
      <span className="truncate font-semibold text-[13px] text-foreground leading-4.5">
        {title}
      </span>
    </div>
  );
}

function PreviewCover({ src }: { src: string }) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden bg-muted",
        COVER_HEIGHT_CLASSNAME
      )}
    >
      <img
        alt=""
        className="size-full object-cover"
        decoding="async"
        height={COVER_HEIGHT_PX}
        loading="eager"
        src={src}
        width={PAGE_LINK_PREVIEW_WIDTH_PX}
      />
    </div>
  );
}

function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        PAGE_LINK_PREVIEW_MAX_HEIGHT_CLASSNAME
      )}
      data-slot="page-link-preview"
    >
      {children}
    </div>
  );
}

/** Body lines withheld by the limit, counted rather than faded out. */
function PreviewMoreBlocks({ count }: { count: number }) {
  return (
    <div
      className="mt-auto shrink-0 border-border border-t px-2.5 py-1 text-[10px] text-muted-foreground"
      data-slot="page-link-preview-more"
    >
      {count} more {count === 1 ? "block" : "blocks"}
    </div>
  );
}

/** The card's body: the lines that fit, then a count of the ones that did not. */
export function PageLinkPreviewBodyRegion({
  body,
}: {
  body: PageLinkPreviewBody;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden px-2.5 pb-2">
        {body.lines.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">
            No content yet
          </span>
        ) : (
          body.lines.map((line) => <PreviewLine key={line.id} line={line} />)
        )}
      </div>
      {body.hiddenCount > 0 ? (
        <PreviewMoreBlocks count={body.hiddenCount} />
      ) : null}
    </>
  );
}

export function PageLinkPreviewCardLoading() {
  return (
    <PreviewShell>
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-3.5 rounded-sm" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-4/5" />
        <Skeleton className="h-2.5 w-2/3" />
      </div>
    </PreviewShell>
  );
}

/** Deleted or never-resolvable target: say so, using whatever label survived. */
export function PageLinkPreviewCardMissing({ label }: { label?: string }) {
  return (
    <PreviewShell>
      <div className="flex flex-col gap-1 p-2.5">
        <div className="flex items-center gap-1.5">
          <PreviewChipIcon>
            <IconFileAlert />
          </PreviewChipIcon>
          <span className="truncate text-[12px] text-muted-foreground">
            {label?.trim() || "Missing page"}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Page not found
        </span>
      </div>
    </PreviewShell>
  );
}

interface PageLinkPreviewCardProps {
  /** Stored mark text, used when the page itself cannot be resolved. */
  label?: string;
  pageId: string;
}

export function PageLinkPreviewCard({
  label,
  pageId,
}: PageLinkPreviewCardProps): ReactNode {
  const page = usePageSummary(pageId);
  const { blocks: localBlocks, localPage } = usePageBlocks(pageId);
  // A pristine shipped page has no local shard; its body lives in the shipped
  // catalog, which is one small request cached for the session.
  const { data: shippedPages, isPending: shippedPending } = useQuery({
    ...sitePagesQueryOptions,
    enabled: localBlocks.length === 0,
  });
  const properties = useRowProperties(localPage?.databaseRowSource);

  const blocks = useMemo(() => {
    if (localBlocks.length > 0) {
      return localBlocks;
    }
    return shippedPages?.find((entry) => entry.id === pageId)?.blocks ?? [];
  }, [localBlocks, pageId, shippedPages]);

  const body = useMemo(() => buildPageLinkPreviewBody(blocks), [blocks]);

  if (!(page || localPage)) {
    return <PageLinkPreviewCardMissing label={label} />;
  }

  if (localBlocks.length === 0 && shippedPending) {
    return <PageLinkPreviewCardLoading />;
  }

  const headerImage = localPage?.headerImage;
  const hasProperties = properties.fields.length > 0;
  const coverSrc =
    headerImage?.source === "url" && !hasProperties ? headerImage.src : null;
  const title =
    (localPage?.title ?? page?.title ?? "").trim() ||
    label?.trim() ||
    DEFAULT_PAGE_TITLE;

  return (
    <PreviewShell>
      {coverSrc ? <PreviewCover src={coverSrc} /> : null}
      <PreviewHeader icon={localPage?.icon ?? page?.icon} title={title} />
      {hasProperties ? (
        <PreviewProperties
          fields={properties.fields}
          values={properties.values}
        />
      ) : null}
      <PageLinkPreviewBodyRegion body={body} />
    </PreviewShell>
  );
}

export interface PageLinkPreviewTarget {
  anchor: HTMLElement;
  label?: string;
  pageId: string;
}

/**
 * Open/close scheduling for the hover card. Page bodies are already local (or
 * a session-cached shipped catalog), so there is nothing to prefetch and one
 * short anti-flyover delay covers every open.
 */
export function usePageLinkPreviewController(enabled: boolean) {
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [target, setTarget] = useState<PageLinkPreviewTarget | null>(null);

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
    setTarget(null);
  }, [clearTimers]);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setTarget(null);
    }, HOVER_PREVIEW_CLOSE_DELAY_MS);
  }, []);

  const scheduleOpen = useCallback(
    (next: PageLinkPreviewTarget) => {
      if (!enabled) {
        return;
      }
      cancelClose();
      if (openTimerRef.current !== null) {
        clearTimeout(openTimerRef.current);
      }
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setTarget(next);
      }, HOVER_PREVIEW_OPEN_DELAY_CACHED_MS);
    },
    [cancelClose, enabled]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { cancelClose, closeNow, scheduleClose, scheduleOpen, target };
}

export function PageLinkPreviewPopover({
  onCloseDelay,
  onOpenStay,
  target,
}: {
  onCloseDelay: () => void;
  onOpenStay: () => void;
  target: PageLinkPreviewTarget | null;
}) {
  return (
    <Popover modal={false} open={target !== null}>
      <PopoverContent
        align="start"
        anchor={target?.anchor ?? null}
        className={cn(PAGE_LINK_PREVIEW_WIDTH_CLASSNAME, "gap-0 p-0")}
        finalFocus={false}
        initialFocus={false}
        onPointerEnter={onOpenStay}
        onPointerLeave={onCloseDelay}
        side="top"
        sideOffset={6}
      >
        {target ? (
          <PageLinkPreviewCard label={target.label} pageId={target.pageId} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const ownsPageLink = (anchor: HTMLAnchorElement) =>
  Boolean(anchor.dataset.pageId?.trim());

/**
 * Hover preview for page links inside a contenteditable field. A sibling of
 * {@link EditableInlineLinkPreview} rather than a branch inside it: the two
 * cards share only their timings, and one delegated listener switching on the
 * link kind would have to keep both cards' state alive at once.
 */
export function EditablePageLinkPreview({
  fieldRef,
}: {
  fieldRef: RefObject<HTMLElement | null>;
}) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const hoverEnabled = !isCoarsePointer;
  const { cancelClose, closeNow, scheduleClose, scheduleOpen, target } =
    usePageLinkPreviewController(hoverEnabled);

  const handleEnter = useCallback(
    (anchor: HTMLAnchorElement) => {
      const pageId = anchor.dataset.pageId?.trim();
      if (!pageId) {
        return;
      }
      scheduleOpen({
        anchor,
        pageId,
        ...(anchor.textContent?.trim()
          ? { label: anchor.textContent.trim() }
          : {}),
      });
    },
    [scheduleOpen]
  );

  useDelegatedLinkHover({
    enabled: hoverEnabled,
    fieldRef,
    onEnter: handleEnter,
    onLeave: scheduleClose,
    onPointerDown: closeNow,
    owns: ownsPageLink,
  });

  if (!hoverEnabled) {
    return null;
  }

  return (
    <PageLinkPreviewPopover
      onCloseDelay={scheduleClose}
      onOpenStay={cancelClose}
      target={target}
    />
  );
}
