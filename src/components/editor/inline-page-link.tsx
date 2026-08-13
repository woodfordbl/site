import { IconFileAlert } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import {
  PageLinkPreviewPopover,
  usePageLinkPreviewController,
} from "@/components/editor/page-link-preview.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import { inlineTokenBorderOffsetClassName } from "@/lib/editor/inline-token-rule.ts";
import { PAGE_LINK_ANCHOR_SELECTOR } from "@/lib/editor/rich-text-dom.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { cn } from "@/lib/utils.ts";

/** Compact inline page-link chrome (icon + title, one rule under both). */
export const inlinePageLinkClassName = cn(
  // `inline-block`, not `inline-flex`: a flex box takes its baseline from its
  // first item — the icon slot, which is empty until the chrome portal fills it
  // — so the run sat below the prose baseline and needed a nudge to fake it
  // back up. An inline-block's baseline is its own text baseline, which lands
  // on the prose baseline exactly, at every font size, with no correction.
  // `whitespace-nowrap` keeps that true: a title wrapping inside the box would
  // move the baseline to its last line.
  "inline-block cursor-pointer whitespace-nowrap",
  // The run reads as running text: the surrounding colour and size, with the
  // rule as its only standing affordance — so hover moves the rule, not the text.
  "text-[length:inherit] text-inherit leading-none no-underline",
  // A border, not `underline`: text-decoration is not drawn across the atomic
  // icon box, so only a border gives one continuous rule under icon *and* title.
  // `leading-none` shrinks the anchor to its glyphs so the rule lands near the
  // baseline instead of at the bottom of a full leading-relaxed line box.
  "border-border border-b hover:border-muted-foreground",
  inlineTokenBorderOffsetClassName
);

/**
 * The icon is sized in `em` so it tracks the surrounding text instead of
 * staying at a fixed px — the same run has to look right in body copy and in a
 * heading. Mirrors `iconSlotClassName`'s structure without its fixed steps.
 */
export const inlinePageLinkIconClassName = cn(
  "inline-flex shrink-0 items-center justify-center",
  // The anchor is no longer a flex row, so the icon carries its own gap and
  // sits itself on the line: `-0.125em` drops it off the baseline until it is
  // optically centred on the title's x-height.
  "mr-1 align-[-0.125em]",
  "[&_[role=img]]:text-[0.95em] [&_[role=img]]:leading-none [&_svg]:size-[0.95em]"
);

interface InlinePageLinkProps {
  className?: string;
  /** Fallback label when the page is missing (usually the stored mark text). */
  label?: string;
  pageId: string;
}

/**
 * Read-only inline page link: page icon + title under one shared underline,
 * with a hover card previewing the linked page (see `page-link-preview.tsx`).
 * Title resolves live from the page catalog (same as `pageLink` blocks).
 */
export function InlinePageLink({
  className,
  label,
  pageId,
}: InlinePageLinkProps) {
  const page = usePageSummary(pageId);
  const { pages } = useMergedPageListItems();
  const hoverEnabled = !useIsCoarsePrimaryPointer();
  const { cancelClose, closeNow, scheduleClose, scheduleOpen, target } =
    usePageLinkPreviewController(hoverEnabled);

  const handlePointerEnter = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    scheduleOpen({
      anchor: event.currentTarget,
      pageId,
      ...(label?.trim() ? { label: label.trim() } : {}),
    });
  };

  if (!page) {
    return (
      <span
        className={cn(
          inlinePageLinkClassName,
          "text-muted-foreground italic",
          className
        )}
      >
        <span className={inlinePageLinkIconClassName}>
          <IconFileAlert />
        </span>
        <span>{label?.trim() || "Missing page"}</span>
      </span>
    );
  }

  const navTarget = resolvePageNavTarget(pageId, pages);
  const title = page.title.trim() || label?.trim() || "Untitled";

  return (
    <>
      <Link
        className={cn(inlinePageLinkClassName, className)}
        onPointerDown={closeNow}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={scheduleClose}
        {...navTarget}
      >
        <span className={inlinePageLinkIconClassName}>
          <PageIconDisplay icon={page.icon} />
        </span>
        <span>{title}</span>
      </Link>
      <PageLinkPreviewPopover
        onCloseDelay={scheduleClose}
        onOpenStay={cancelClose}
        target={target}
      />
    </>
  );
}

export interface InlinePageLinkChromeHost {
  icon: HTMLElement;
  /** Stable across rescans: the same page may be linked more than once. */
  key: string;
  pageId: string;
}

/**
 * The `data-inline-page-link-chrome` hosts currently in the field DOM. The
 * caller must scan *after* rebuilding the field (the rebuild replaces every
 * child), otherwise the portals would target detached nodes and the icon
 * would render into nothing.
 */
export function collectInlinePageLinkChromeHosts(
  root: HTMLElement | null
): InlinePageLinkChromeHost[] {
  if (!root) {
    return [];
  }
  const hosts: InlinePageLinkChromeHost[] = [];
  const seen = new Map<string, number>();
  for (const anchor of root.querySelectorAll(PAGE_LINK_ANCHOR_SELECTOR)) {
    if (!(anchor instanceof HTMLElement)) {
      continue;
    }
    const pageId = anchor.dataset.pageId?.trim();
    const icon = anchor.querySelector('[data-inline-page-link-chrome="icon"]');
    if (!(pageId && icon instanceof HTMLElement)) {
      continue;
    }
    const occurrence = seen.get(pageId) ?? 0;
    seen.set(pageId, occurrence + 1);
    hosts.push({ pageId, icon, key: `${pageId}#${occurrence}` });
  }
  return hosts;
}

/** Host lists match when the same nodes are hosting the same pages, in order. */
export function inlinePageLinkChromeHostsEqual(
  a: readonly InlinePageLinkChromeHost[],
  b: readonly InlinePageLinkChromeHost[]
): boolean {
  return (
    a.length === b.length &&
    a.every((host, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        host.key === other.key &&
        host.icon === other.icon
      );
    })
  );
}

/**
 * Fills the field's chrome hosts with the same icon as {@link InlinePageLink}.
 * Hosts are owned by the field, which rescans them after every rebuild — see
 * {@link collectInlinePageLinkChromeHosts}.
 */
export function InlinePageLinkChrome({
  hosts,
}: {
  hosts: readonly InlinePageLinkChromeHost[];
}) {
  return (
    <>
      {hosts.map((host) => (
        <InlinePageLinkChromePortals
          iconHost={host.icon}
          key={host.key}
          pageId={host.pageId}
        />
      ))}
    </>
  );
}

function InlinePageLinkChromePortals({
  iconHost,
  pageId,
}: {
  iconHost: HTMLElement;
  pageId: string;
}) {
  const page = usePageSummary(pageId);
  if (!iconHost.isConnected) {
    return null;
  }
  return createPortal(
    <span className={inlinePageLinkIconClassName}>
      {page ? <PageIconDisplay icon={page.icon} /> : <IconFileAlert />}
    </span>,
    iconHost
  );
}
