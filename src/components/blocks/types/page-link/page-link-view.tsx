import { IconArrowUpRight } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { cn } from "@/lib/utils.ts";

type PageLinkViewProps = BlockViewProps<"pageLink">;

export function PageLinkView({ props, className }: PageLinkViewProps) {
  const page = usePageSummary(props.pageId);
  const { pages } = useMergedPageListItems();

  if (!page) {
    return (
      <p className={cn("text-lg text-muted-foreground italic", className)}>
        Missing page
      </p>
    );
  }

  const navTarget = resolvePageNavTarget(props.pageId, pages);

  return (
    <p className={cn("text-lg leading-relaxed", className)}>
      <Link
        className="inline-flex items-center gap-1 text-foreground hover:text-foreground/80"
        {...navTarget}
      >
        <span className="underline underline-offset-4">{page.title}</span>
        <IconArrowUpRight className="text-muted-foreground" />
      </Link>
    </p>
  );
}
