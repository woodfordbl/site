import { IconArrowUpRight, IconFileAlert } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { createPortal } from "react-dom";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import { PAGE_LINK_ANCHOR_SELECTOR } from "@/lib/editor/rich-text-dom.ts";
import { pageTitleUnderlineClassName } from "@/lib/pages/page-link-display.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { cn } from "@/lib/utils.ts";

/** Compact inline page-link chrome (matches `pageLink` block: icon + title + arrow). */
export const inlinePageLinkClassName = cn(
  "inline-flex items-center gap-1 text-foreground hover:text-foreground/80",
  // `align-middle` keeps the run centred on the surrounding line: an inline-flex
  // box otherwise takes its baseline from its first item — the icon slot, which
  // is empty until the chrome portal fills it — and rides above the text.
  "cursor-pointer align-middle no-underline",
  // The title inherits the block's font, so it must not pick up any sizing of
  // its own — an inline page link reads at exactly the size of the text it sits in.
  "text-[length:inherit] leading-[inherit]"
);

/**
 * Icon/arrow are sized in `em` so they track the surrounding text instead of
 * staying at a fixed px — the same run has to look right in body copy and in a
 * heading. Mirrors `iconSlotClassName`'s structure without its fixed steps.
 */
export const inlinePageLinkIconClassName = cn(
  "inline-flex shrink-0 items-center justify-center",
  "[&_[role=img]]:text-[0.95em] [&_[role=img]]:leading-none [&_svg]:size-[0.95em]"
);

/** Trailing arrow — a touch smaller than the page icon, as on `pageLink` rows. */
export const inlinePageLinkArrowClassName =
  "size-[0.8em] text-muted-foreground";

interface InlinePageLinkProps {
  className?: string;
  /** Fallback label when the page is missing (usually the stored mark text). */
  label?: string;
  pageId: string;
}

/**
 * Read-only inline page link: page icon + underlined title + upright arrow.
 * Title resolves live from the page catalog (same as `pageLink` blocks).
 */
export function InlinePageLink({
  className,
  label,
  pageId,
}: InlinePageLinkProps) {
  const page = usePageSummary(pageId);
  const { pages } = useMergedPageListItems();

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
        <span className={pageTitleUnderlineClassName}>
          {label?.trim() || "Missing page"}
        </span>
      </span>
    );
  }

  const navTarget = resolvePageNavTarget(pageId, pages);
  const title = page.title.trim() || label?.trim() || "Untitled";

  return (
    <Link className={cn(inlinePageLinkClassName, className)} {...navTarget}>
      <span className={inlinePageLinkIconClassName}>
        <PageIconDisplay icon={page.icon} />
      </span>
      <span className={pageTitleUnderlineClassName}>{title}</span>
      <IconArrowUpRight className={inlinePageLinkArrowClassName} />
    </Link>
  );
}

export interface InlinePageLinkChromeHost {
  arrow: HTMLElement;
  icon: HTMLElement;
  /** Stable across rescans: the same page may be linked more than once. */
  key: string;
  pageId: string;
}

/**
 * The `data-inline-page-link-chrome` hosts currently in the field DOM. The
 * caller must scan *after* rebuilding the field (the rebuild replaces every
 * child), otherwise the portals would target detached nodes and the icon and
 * arrow would render into nothing.
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
    const arrow = anchor.querySelector(
      '[data-inline-page-link-chrome="arrow"]'
    );
    if (
      !(pageId && icon instanceof HTMLElement && arrow instanceof HTMLElement)
    ) {
      continue;
    }
    const occurrence = seen.get(pageId) ?? 0;
    seen.set(pageId, occurrence + 1);
    hosts.push({ pageId, icon, arrow, key: `${pageId}#${occurrence}` });
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
        host.icon === other.icon &&
        host.arrow === other.arrow
      );
    })
  );
}

/**
 * Fills the field's chrome hosts with the same icon/arrow as
 * {@link InlinePageLink}. Hosts are owned by the field, which rescans them
 * after every rebuild — see {@link collectInlinePageLinkChromeHosts}.
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
          arrowHost={host.arrow}
          iconHost={host.icon}
          key={host.key}
          pageId={host.pageId}
        />
      ))}
    </>
  );
}

function InlinePageLinkChromePortals({
  arrowHost,
  iconHost,
  pageId,
}: {
  arrowHost: HTMLElement;
  iconHost: HTMLElement;
  pageId: string;
}) {
  const page = usePageSummary(pageId);
  if (!(iconHost.isConnected && arrowHost.isConnected)) {
    return null;
  }
  return (
    <>
      {createPortal(
        <span className={inlinePageLinkIconClassName}>
          {page ? <PageIconDisplay icon={page.icon} /> : <IconFileAlert />}
        </span>,
        iconHost
      )}
      {createPortal(
        <IconArrowUpRight className={inlinePageLinkArrowClassName} />,
        arrowHost
      )}
    </>
  );
}
