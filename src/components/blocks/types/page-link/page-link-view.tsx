import { IconArrowUpRight } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import { usePageLinkCanvasPageId } from "@/hooks/use-page-link-canvas-page-id.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import {
  pageLinkShowsExternalIcon,
  pageTitleUnderlineClassName,
} from "@/lib/pages/page-link-display.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";

type PageLinkViewProps = BlockViewProps<"pageLink">;

export function PageLinkView({ props }: PageLinkViewProps) {
  const page = usePageSummary(props.pageId);
  const { pages } = useMergedPageListItems();
  const canvasPageId = usePageLinkCanvasPageId();
  const showExternalIcon = pageLinkShowsExternalIcon(props, page, canvasPageId);

  if (!page) {
    return <p className="text-lg text-muted-foreground italic">Missing page</p>;
  }

  const navTarget = resolvePageNavTarget(props.pageId, pages);

  return (
    <p className="text-lg leading-relaxed">
      <Link
        className="inline-flex items-center gap-1.5 text-foreground hover:text-foreground/80"
        {...navTarget}
      >
        <span className={iconSlotClassName("default")}>
          <PageIconDisplay icon={page.icon} />
        </span>
        <span className={pageTitleUnderlineClassName}>{page.title}</span>
        {showExternalIcon ? (
          <IconArrowUpRight className="text-muted-foreground" />
        ) : null}
      </Link>
    </p>
  );
}
