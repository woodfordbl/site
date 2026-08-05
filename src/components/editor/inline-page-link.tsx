import { IconArrowUpRight, IconFileAlert } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { type RefObject, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import { pageTitleUnderlineClassName } from "@/lib/pages/page-link-display.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { cn } from "@/lib/utils.ts";

/** Compact inline page-link chrome (matches `pageLink` block: icon + title + arrow). */
export const inlinePageLinkClassName = cn(
  "inline-flex items-center gap-1 text-foreground hover:text-foreground/80",
  "cursor-pointer no-underline"
);

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
        <span className={iconSlotClassName("xs")}>
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
      <span className={iconSlotClassName("xs")}>
        <PageIconDisplay icon={page.icon} />
      </span>
      <span className={pageTitleUnderlineClassName}>{title}</span>
      <IconArrowUpRight className="size-3.5 text-muted-foreground" />
    </Link>
  );
}

interface PageLinkChromeHosts {
  arrow: HTMLElement;
  icon: HTMLElement;
  pageId: string;
}

/**
 * Fills `data-inline-page-link-chrome` hosts inside a rich-text field with the
 * same icon/arrow chrome as {@link InlinePageLink}. Re-scans when the field
 * DOM is rebuilt from the mark model.
 */
export function EditableInlinePageLinkChrome({
  fieldRef,
  revision,
}: {
  fieldRef: RefObject<HTMLElement | null>;
  /** Bump when `(value, marks)` change so hosts are re-queried after rebuild. */
  revision: string;
}) {
  const [hosts, setHosts] = useState<PageLinkChromeHosts[]>([]);

  // revision intentionally re-scans hosts after the mark model rebuilds the DOM.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is a rebuild token, not a closed-over value
  useLayoutEffect(() => {
    const root = fieldRef.current;
    if (!root) {
      setHosts([]);
      return;
    }
    const next: PageLinkChromeHosts[] = [];
    for (const anchor of root.querySelectorAll("a[data-page-id]")) {
      if (!(anchor instanceof HTMLElement)) {
        continue;
      }
      const pageId = anchor.dataset.pageId?.trim();
      const icon = anchor.querySelector(
        '[data-inline-page-link-chrome="icon"]'
      );
      const arrow = anchor.querySelector(
        '[data-inline-page-link-chrome="arrow"]'
      );
      if (
        !(pageId && icon instanceof HTMLElement && arrow instanceof HTMLElement)
      ) {
        continue;
      }
      next.push({ pageId, icon, arrow });
    }
    setHosts(next);
  }, [fieldRef, revision]);

  return (
    <>
      {hosts.map((host) => (
        <InlinePageLinkChromePortals
          arrowHost={host.arrow}
          iconHost={host.icon}
          key={`${host.pageId}:${host.icon.isConnected}`}
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
        <span className={iconSlotClassName("xs")}>
          {page ? <PageIconDisplay icon={page.icon} /> : <IconFileAlert />}
        </span>,
        iconHost
      )}
      {createPortal(
        <IconArrowUpRight className="size-3.5 text-muted-foreground" />,
        arrowHost
      )}
    </>
  );
}
