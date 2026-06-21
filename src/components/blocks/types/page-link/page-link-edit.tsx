import { IconArrowUpRight, IconFileAlert } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button, iconSlotClassName } from "@/components/ui/button.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import { usePageLinkCanvasPageId } from "@/hooks/use-page-link-canvas-page-id.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import {
  pageLinkShowsExternalIcon,
  pageTitleUnderlineClassName,
} from "@/lib/pages/page-link-display.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";

type PageLinkEditProps = BlockEditProps<"pageLink">;

export function PageLinkEdit({
  autoFocus,
  onAutoFocusHandled,
  props,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
}: PageLinkEditProps) {
  const page = usePageSummary(props.pageId);
  const { pages } = useMergedPageListItems();
  const canvasPageId = usePageLinkCanvasPageId();
  const showExternalIcon = pageLinkShowsExternalIcon(props, page, canvasPageId);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const applyAutoFocus = useCallback(() => {
    (page ? linkRef.current : buttonRef.current)?.focus();
  }, [page]);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useInlineCustomBlockKeys({
    onExtendSelectionDown,
    onExtendSelectionUp,
    onMoveRowDown,
    onMoveRowUp,
    onNavigateDown,
    onNavigateUp,
    onStructuralKey,
  });
  if (!page) {
    return (
      <Button
        className="w-full justify-start px-1 font-normal text-base focus-visible:border-none focus-visible:ring-0"
        onKeyDown={handleKeyDown}
        ref={buttonRef}
        size="lg"
        type="button"
        variant="ghost"
      >
        <IconFileAlert />
        Missing page
      </Button>
    );
  }

  const navTarget = resolvePageNavTarget(props.pageId, pages);

  return (
    <Button
      className="w-full justify-start px-1 font-normal text-base focus-visible:border-none focus-visible:ring-0"
      nativeButton={false}
      onKeyDown={handleKeyDown}
      render={
        <Link
          className="inline-flex items-center gap-1.5"
          ref={linkRef}
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
      }
      size="lg"
      variant="ghost"
    />
  );
}
