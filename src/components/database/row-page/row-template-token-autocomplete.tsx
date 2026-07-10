"use client";

import { IconClock, IconMathFunction } from "@tabler/icons-react";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { FIELD_TYPE_DEFS } from "@/lib/databases/field-defs.ts";
import { rowPropertyToken } from "@/lib/databases/row-template.ts";
import { isRichTextField } from "@/lib/editor/caret-navigation.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * `{{`-triggered property autocomplete for the row-template editor. Mounted
 * only by the `/db/$databaseId/template` route, so tokens complete exactly
 * where they mean something. Deliberately NOT threaded through the canvas
 * editing pipeline (the slash menu's plumbing): it observes `input` events on
 * the page's rich-text fields, reads the caret's text node for an unclosed
 * `{{`, and — on confirm — replaces `{{ …query` with the canonical closed
 * token via `execCommand("insertText")`, which fires the same input path as
 * typing so block persistence and undo behave normally. While open it
 * captures Arrow/Enter/Tab/Escape at the window so the canvas never sees
 * them.
 */

/** Query longer than this can't be a token-in-progress — stop offering. */
const MAX_QUERY_LENGTH = 40;

interface TokenOption {
  detail: string;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  insert: string;
  key: string;
  label: string;
}

interface TokenContext {
  /** Caret offset (end of the typed query). */
  end: number;
  node: Text;
  query: string;
  /** Offset of `{{` in the node. */
  start: number;
}

/**
 * The caret's unclosed `{{ …` run inside a rich-text canvas field, or null.
 * Single-text-node only — tokens typed across formatting marks are an edge
 * case the picker just stays closed for.
 */
function readTokenContext(): TokenContext | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const active = document.activeElement;
  if (!(active && isRichTextField(active) && active.contains(node))) {
    return null;
  }

  const upToCaret = (node.textContent ?? "").slice(0, range.startOffset);
  const start = upToCaret.lastIndexOf("{{");
  if (start === -1) {
    return null;
  }
  const typed = upToCaret.slice(start + 2);
  if (
    typed.includes("}}") ||
    typed.includes("{") ||
    typed.length > MAX_QUERY_LENGTH
  ) {
    return null;
  }
  return {
    node: node as Text,
    start,
    end: range.startOffset,
    query: typed.trim(),
  };
}

/** Viewport rect to anchor the picker under (caret, or field as fallback). */
function readAnchorRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.getBoundingClientRect() : null;
}

function buildOptions(database: LocalDatabase, query: string): TokenOption[] {
  const normalized = query.toLowerCase();
  const fieldOptions = database.fields
    .filter((field) => field.name.toLowerCase().includes(normalized))
    .map((field): TokenOption => {
      const isFormula = field.type === "formula";
      return {
        key: `field:${field.id}`,
        label: field.name,
        detail: isFormula
          ? "can't reference formulas yet"
          : FIELD_TYPE_DEFS[field.type].label,
        disabled: isFormula,
        icon: resolveFieldIcon(field),
        insert: rowPropertyToken(field.name),
      };
    });
  const functionOptions: TokenOption[] = [
    {
      key: "fn:now",
      label: "now()",
      detail: "date & time",
      icon: IconClock,
      insert: "{{ now() }}",
    },
    {
      key: "fn:today",
      label: "today()",
      detail: "date",
      icon: IconMathFunction,
      insert: "{{ today() }}",
    },
  ].filter((option) => option.label.toLowerCase().includes(normalized));
  return [...fieldOptions, ...functionOptions];
}

type PickerKeyAction = "close" | "confirm" | "down" | "up";

/** Keys the open picker owns; everything else passes through to the canvas. */
function keyAction(key: string): PickerKeyAction | null {
  switch (key) {
    case "Escape":
      return "close";
    case "Enter":
    case "Tab":
      return "confirm";
    case "ArrowDown":
      return "down";
    case "ArrowUp":
      return "up";
    default:
      return null;
  }
}

/** The next highlight in `direction`, wrapping; undefined when empty. */
function stepHighlight(
  enabledOptions: TokenOption[],
  highlighted: TokenOption | undefined,
  direction: "down" | "up"
): TokenOption | undefined {
  if (enabledOptions.length === 0) {
    return;
  }
  const index = highlighted
    ? enabledOptions.findIndex((option) => option.key === highlighted.key)
    : 0;
  const delta = direction === "down" ? 1 : -1;
  return enabledOptions[
    (index + delta + enabledOptions.length) % enabledOptions.length
  ];
}

export function RowTemplateTokenAutocomplete({
  database,
}: {
  database: LocalDatabase;
}): ReactNode {
  const [context, setContext] = useState<TokenContext | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const options = useMemo(
    () => (context ? buildOptions(database, context.query) : []),
    [database, context]
  );
  const enabledOptions = useMemo(
    () => options.filter((option) => !option.disabled),
    [options]
  );
  const highlighted =
    enabledOptions.find((option) => option.key === highlightKey) ??
    enabledOptions[0];

  const close = useCallback(() => {
    setContext(null);
    setAnchorRect(null);
    setHighlightKey(null);
  }, []);

  const sync = useCallback(() => {
    const next = readTokenContext();
    setContext(next);
    setAnchorRect(next ? readAnchorRect() : null);
    if (!next) {
      setHighlightKey(null);
    }
  }, []);

  const confirm = useCallback(
    (option: TokenOption) => {
      // Re-read at confirm time — the tracked offsets may be stale after IME
      // composition or a re-render.
      const current = readTokenContext();
      if (!current) {
        close();
        return;
      }
      const selection = window.getSelection();
      if (!selection) {
        close();
        return;
      }
      const range = document.createRange();
      range.setStart(current.node, current.start);
      range.setEnd(current.node, current.end);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, option.insert);
      close();
    },
    [close]
  );

  // Track typing: any input inside a rich-text field re-reads the caret run.
  useEffect(() => {
    const handleInput = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && isRichTextField(target)) {
        sync();
      }
    };
    document.addEventListener("input", handleInput, true);
    return () => document.removeEventListener("input", handleInput, true);
  }, [sync]);

  // Caret moves/blur close the picker when the run is gone.
  useEffect(() => {
    if (!context) {
      return;
    }
    const handleSelectionChange = () => {
      if (!readTokenContext()) {
        close();
      }
    };
    const handleScroll = () => close();
    // Blur can move focus without a selectionchange (e.g. programmatic or
    // chrome clicks) — close once focus is neither in a field nor the picker.
    const handleFocusOut = () => {
      // Deferred so the follow-up focusin (if any) lands first. setTimeout
      // over rAF: rAF pauses in hidden tabs and the popup would leak.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          active &&
          (isRichTextField(active) || active.closest('[role="listbox"]'))
        ) {
          return;
        }
        close();
      }, 0);
    };
    // Click-away: any press outside the picker closes it (a press inside a
    // text field moves the caret anyway; typing reopens the picker).
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[role="listbox"]')) {
        return;
      }
      close();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [context, close]);

  // While open, own the navigation keys before the canvas sees them.
  useEffect(() => {
    if (!context) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = keyAction(event.key);
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
        if (highlighted) {
          confirm(highlighted);
        }
        return;
      }
      const next = stepHighlight(enabledOptions, highlighted, action);
      if (next) {
        setHighlightKey(next.key);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [context, enabledOptions, highlighted, confirm, close]);

  if (!(context && anchorRect) || options.length === 0) {
    return null;
  }

  const top = Math.max(8, anchorRect.bottom + 6);
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 288));

  return createPortal(
    <div
      className="fixed z-50 w-70 rounded-lg border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md"
      role="listbox"
      style={{ top, left }}
    >
      <div className="px-2 pt-1.5 pb-0.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Insert property
      </div>
      {options.map((option) => {
        const OptionIcon = option.icon;
        const isHighlighted =
          !option.disabled && option.key === highlighted?.key;
        return (
          <button
            aria-selected={isHighlighted}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
              option.disabled ? "cursor-default opacity-45" : "cursor-pointer",
              isHighlighted && "bg-muted"
            )}
            disabled={option.disabled}
            key={option.key}
            onClick={() => {
              confirm(option);
            }}
            onMouseDown={(event) => {
              // Keep the caret in the block so confirm can splice the token.
              event.preventDefault();
            }}
            onMouseEnter={() => {
              if (!option.disabled) {
                setHighlightKey(option.key);
              }
            }}
            role="option"
            type="button"
          >
            <OptionIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className="shrink-0 text-muted-foreground text-xs">
              {option.detail}
            </span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
