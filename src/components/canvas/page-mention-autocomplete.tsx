"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { inlinePageLinkClassName } from "@/components/editor/inline-page-link.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { useCaretTokenSession } from "@/hooks/use-caret-token-session.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  caretTokenPickerKeyAction,
  dispatchRichTextInput,
  readCaretTokenContext,
  selectCaretTokenRange,
  stepCaretTokenHighlight,
} from "@/lib/editor/caret-token-trigger.ts";
import { insertLinkedTextAtSelection } from "@/lib/editor/rich-text-dom.ts";
import { buildPageLinkUrl } from "@/lib/pages/copy-page-link.ts";
import { filterPageLinkTargetItems } from "@/lib/pages/page-slash-menu.ts";
import { cn } from "@/lib/utils.ts";

/**
 * `@`-triggered inline page mention picker for the canvas editor. Replaces the
 * `@query` run with an inline page-link mark (`link` + `pageId`). Escape closes
 * the list and leaves `@query` as plain text. Not wired through slash menu
 * plumbing (slash Link To Page converts the whole row to a `pageLink` block).
 */

export function PageMentionAutocomplete({
  currentPageId,
}: {
  currentPageId: string;
}): ReactNode {
  const { pages } = useMergedPageListItems();
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const readContext = useCallback(() => readCaretTokenContext("@"), []);
  const { anchorRect, close, context } = useCaretTokenSession(readContext);

  const options = useMemo(() => {
    if (!context) {
      return [];
    }
    return filterPageLinkTargetItems(context.query, currentPageId, pages);
  }, [context, currentPageId, pages]);

  const highlighted =
    options.find((option) => option.key === highlightKey) ?? options[0];

  useEffect(() => {
    if (!context) {
      setHighlightKey(null);
    }
  }, [context]);

  const confirm = useCallback(
    (pageId: string) => {
      const current = readCaretTokenContext("@");
      if (!current) {
        close();
        return;
      }
      const page = pages.find((entry) => entry.id === pageId);
      const title = page?.title.trim() || "Untitled";
      const href =
        buildPageLinkUrl(pageId, pages, window.location.origin) ??
        `${window.location.origin}/`;
      if (!selectCaretTokenRange(current)) {
        close();
        return;
      }
      insertLinkedTextAtSelection(
        current.field,
        href,
        inlinePageLinkClassName,
        { pageId, label: title }
      );
      dispatchRichTextInput(current.field);
      close();
    },
    [close, pages]
  );

  useEffect(() => {
    if (!context) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = caretTokenPickerKeyAction(event.key);
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (action === "close") {
        close();
        return;
      }
      if (action === "confirm") {
        const actionTarget = highlighted?.action;
        if (actionTarget?.type === "page.link") {
          confirm(actionTarget.pageId);
        }
        return;
      }
      const next = stepCaretTokenHighlight(options, highlighted, action);
      if (next) {
        setHighlightKey(next.key);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [close, confirm, context, highlighted, options]);

  if (!(context && anchorRect) || options.length === 0) {
    return null;
  }

  const top = Math.max(8, anchorRect.bottom + 6);
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 288));

  return createPortal(
    <div
      className="fixed z-50 w-70 rounded-lg border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md"
      data-caret-token-popover=""
      role="listbox"
      style={{ top, left }}
    >
      <div className="px-2 pt-1.5 pb-0.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Mention page
      </div>
      {options.map((option) => {
        const isHighlighted = option.key === highlighted?.key;
        const pageId =
          option.action.type === "page.link" ? option.action.pageId : null;
        const page = pageId
          ? pages.find((entry) => entry.id === pageId)
          : undefined;
        return (
          <button
            aria-selected={isHighlighted}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left",
              isHighlighted && "bg-muted"
            )}
            key={option.key}
            onClick={() => {
              if (pageId) {
                confirm(pageId);
              }
            }}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onMouseEnter={() => {
              setHighlightKey(option.key);
            }}
            role="option"
            type="button"
          >
            <PageIconDisplay className="size-4 shrink-0" icon={page?.icon} />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
