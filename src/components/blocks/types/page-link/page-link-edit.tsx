import { IconArrowUpRight, IconFile, IconFileAlert } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { handleBlockModifierArrowKeyDown } from "@/lib/editor/field-keydown.ts";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    (page ? linkRef.current : buttonRef.current)?.focus();
    onAutoFocusHandled?.();
  }, [autoFocus, onAutoFocusHandled, page]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      if (
        handleBlockModifierArrowKeyDown(event, {
          onExtendSelectionDown,
          onExtendSelectionUp,
          onMoveRowDown,
          onMoveRowUp,
        })
      ) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        onNavigateDown?.();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        onNavigateUp?.();
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onStructuralKey?.(true, event.key);
      }
    },
    [
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onNavigateDown,
      onNavigateUp,
      onStructuralKey,
    ]
  );

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
      onKeyDown={handleKeyDown}
      render={
        <Link ref={linkRef} {...navTarget}>
          <IconFile />
          {page.title}
          <IconArrowUpRight className="text-muted-foreground" />
        </Link>
      }
      size="lg"
      variant="ghost"
    />
  );
}
