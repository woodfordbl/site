import {
  IconBold,
  IconCode,
  IconItalic,
  IconLink,
  IconPaint,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react";
import {
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { BlockColorSwatch } from "@/components/canvas/block-color-swatch.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  BLOCK_COLOR_DEFS,
  BLOCK_COLOR_IDS,
  resolveBlockColorCapability,
} from "@/lib/blocks/block-colors.ts";
import { findRowContext } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import {
  getLastUsedBlockColors,
  recordLastUsedBlockColor,
} from "@/lib/blocks/last-used-block-color.ts";
import {
  blockSupportsInlineMarks,
  getBlockMarks,
  getLinkHrefInRange,
  isMarkActive,
  removeLinkInRange,
  setLinkInRange,
  toggleMarkInRange,
  withBlockRichText,
} from "@/lib/blocks/rich-text.ts";
import {
  type FieldSelection,
  isRichTextField,
} from "@/lib/editor/caret-navigation.ts";
import { getRichTextSelection } from "@/lib/editor/rich-text-dom.ts";
import type { BlockColor, InlineMarkType } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

const TOOLBAR_GAP_PX = 8;
/** Combo shown for "Use most recent" and handled by the capture listener. */
const APPLY_LAST_COLOR_HOTKEY = "Mod+Shift+H";
/** Combo that opens the link editor for the current selection. */
const LINK_HOTKEY = "Mod+K";

interface ToolbarState {
  rect: { bottom: number; left: number; top: number; width: number };
  rowId: string;
  selection: FieldSelection;
}

const MARK_BUTTONS: Array<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
  type: InlineMarkType;
}> = [
  { type: "bold", label: "Bold", shortcut: "Mod+B", icon: IconBold },
  { type: "italic", label: "Italic", shortcut: "Mod+I", icon: IconItalic },
  {
    type: "underline",
    label: "Underline",
    shortcut: "Mod+U",
    icon: IconUnderline,
  },
  {
    type: "strikethrough",
    label: "Strikethrough",
    shortcut: "Mod+Shift+S",
    icon: IconStrikethrough,
  },
  { type: "code", label: "Inline code", shortcut: "Mod+E", icon: IconCode },
];

/** Palette order shown in the compact color grid: default first, then the 9 ids. */
const COLOR_SWATCHES: Array<BlockColor | undefined> = [
  undefined,
  ...BLOCK_COLOR_IDS,
];

function readToolbarState(): ToolbarState | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const anchor = selection.anchorNode;
  const anchorElement =
    anchor instanceof Element ? anchor : anchor?.parentElement;
  const field = anchorElement?.closest("[data-canvas-field]");
  if (!(field instanceof HTMLElement && isRichTextField(field))) {
    return null;
  }

  const shell = field.closest("[data-canvas-row-id]");
  const rowId = shell?.getAttribute("data-canvas-row-id");
  if (!rowId) {
    return null;
  }

  const offsets = getRichTextSelection(field);
  if (!offsets || offsets.start === offsets.end) {
    return null;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return {
    rect: {
      bottom: rect.bottom,
      left: rect.left + rect.width / 2,
      top: rect.top,
      width: rect.width,
    },
    rowId,
    selection: offsets,
  };
}

/**
 * Floating formatting toolbar over a non-collapsed text selection inside a
 * rich-text canvas field: inline mark toggles plus the block color menu.
 * Buttons act on the block through the canvas dispatch so the field re-renders
 * with the selection restored.
 */
export function SelectionFormatToolbar() {
  const canvas = useCanvasEditorContext();
  const [state, setState] = useState<ToolbarState | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const colorMenuOpenRef = useRef(false);
  colorMenuOpenRef.current = colorMenuOpen;
  const linkDraftRef = useRef(false);
  linkDraftRef.current = linkDraft !== null;

  useEffect(() => {
    const update = () => {
      // Freeze the toolbar (and its stored selection) while a menu or the link
      // editor steals the DOM selection, so applying still targets the range.
      if (colorMenuOpenRef.current || linkDraftRef.current) {
        return;
      }
      setState(readToolbarState());
    };

    document.addEventListener("selectionchange", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);

  // Mod+Shift+H restyles the focused block with the last-used text + background
  // color so a selection can be highlighted without opening the menu. Capture
  // phase so we claim the combo before TanStack's document listener and the
  // browser (the field's own keydown can't stop them — Start hydrates
  // `document`, the same node the hotkey manager listens on, so stopPropagation
  // there is a no-op). Shift avoids macOS Cmd+H (Hide app).
  useEffect(() => {
    const applyLastColor = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "h" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        !event.shiftKey
      ) {
        return;
      }
      const active = document.activeElement;
      const field =
        active instanceof Element
          ? active.closest("[data-canvas-field]")
          : null;
      if (!(field instanceof HTMLElement && isRichTextField(field))) {
        return;
      }
      const rowId = field
        .closest("[data-canvas-row-id]")
        ?.getAttribute("data-canvas-row-id");
      if (!rowId) {
        return;
      }
      const context = findRowContext(canvas.getRows(), rowId);
      const block = context?.row.effectiveBlock;
      if (!block) {
        return;
      }
      const capability = resolveBlockColorCapability(
        block.type,
        context?.parent?.effectiveBlock.type ?? null
      );
      const lastUsed = getLastUsedBlockColors();
      // Only reapply colors we actually remember, and only where the block
      // allows them — never clear a color the block already carries.
      const patch: { backgroundColor?: BlockColor; color?: BlockColor } = {};
      if (capability.text && lastUsed.color) {
        patch.color = lastUsed.color;
      }
      if (capability.background && lastUsed.backgroundColor) {
        patch.backgroundColor = lastUsed.backgroundColor;
      }
      if (!(patch.color || patch.backgroundColor)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      canvas.dispatch({
        type: "row.update",
        rowId,
        block: { ...block, ...patch },
      });
    };

    document.addEventListener("keydown", applyLastColor, true);
    return () => document.removeEventListener("keydown", applyLastColor, true);
  }, [canvas]);

  // Mod+K opens the link editor for the current selection (capture phase for the
  // same reason as Mod+Shift+H above).
  useEffect(() => {
    const openLinkEditor = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const next = readToolbarState();
      if (!next) {
        return;
      }
      const context = findRowContext(canvas.getRows(), next.rowId);
      const block = context?.row.effectiveBlock;
      if (!(block && blockSupportsInlineMarks(block))) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setState(next);
      setLinkDraft(
        getLinkHrefInRange(
          getBlockMarks(block),
          next.selection.start,
          next.selection.end
        ) ?? ""
      );
    };

    document.addEventListener("keydown", openLinkEditor, true);
    return () => document.removeEventListener("keydown", openLinkEditor, true);
  }, [canvas]);

  // findRowContext resolves nested rows (list items, callout children) and
  // exposes the parent, which scopes the color capability.
  const rowContext = state
    ? findRowContext(canvas.getRows(), state.rowId)
    : null;
  const currentBlock = rowContext?.row.effectiveBlock;
  const colorCapability = currentBlock
    ? resolveBlockColorCapability(
        currentBlock.type,
        rowContext?.parent?.effectiveBlock.type ?? null
      )
    : { text: false, background: false };

  const toggleMark = useCallback(
    (type: InlineMarkType) => {
      if (!(state && currentBlock && blockSupportsInlineMarks(currentBlock))) {
        return;
      }
      const text = getTextFromBlock(currentBlock);
      const nextMarks = toggleMarkInRange(
        getBlockMarks(currentBlock),
        type,
        state.selection.start,
        state.selection.end,
        text.length
      );
      canvas.dispatch({
        type: "row.update",
        rowId: state.rowId,
        block: withBlockRichText(currentBlock, text, nextMarks),
      });
    },
    [canvas, currentBlock, state]
  );

  const setBlockColor = useCallback(
    (key: "color" | "backgroundColor", color: BlockColor | undefined) => {
      if (!(state && currentBlock)) {
        return;
      }
      recordLastUsedBlockColor(key, color);
      canvas.dispatch({
        type: "row.update",
        rowId: state.rowId,
        block: { ...currentBlock, [key]: color },
      });
    },
    [canvas, currentBlock, state]
  );

  // Apply the remembered colors to the current block (menu twin of Mod+Shift+H).
  const applyLastUsedColors = useCallback(() => {
    if (!(state && currentBlock)) {
      return;
    }
    const lastUsed = getLastUsedBlockColors();
    const patch: { backgroundColor?: BlockColor; color?: BlockColor } = {};
    if (colorCapability.text && lastUsed.color) {
      patch.color = lastUsed.color;
    }
    if (colorCapability.background && lastUsed.backgroundColor) {
      patch.backgroundColor = lastUsed.backgroundColor;
    }
    if (!(patch.color || patch.backgroundColor)) {
      return;
    }
    canvas.dispatch({
      type: "row.update",
      rowId: state.rowId,
      block: { ...currentBlock, ...patch },
    });
    setColorMenuOpen(false);
  }, [canvas, colorCapability, currentBlock, state]);

  const applyLink = useCallback(
    (href: string) => {
      if (!(state && currentBlock)) {
        return;
      }
      const text = getTextFromBlock(currentBlock);
      const trimmed = href.trim();
      const currentMarks = getBlockMarks(currentBlock);
      const nextMarks = trimmed
        ? setLinkInRange(
            currentMarks,
            state.selection.start,
            state.selection.end,
            trimmed,
            text.length
          )
        : removeLinkInRange(
            currentMarks,
            state.selection.start,
            state.selection.end,
            text.length
          );
      canvas.dispatch({
        type: "row.update",
        rowId: state.rowId,
        block: withBlockRichText(currentBlock, text, nextMarks),
      });
      setLinkDraft(null);
    },
    [canvas, currentBlock, state]
  );

  if (!(state && currentBlock && blockSupportsInlineMarks(currentBlock))) {
    return null;
  }

  const marks = getBlockMarks(currentBlock);
  const activeLinkHref = getLinkHrefInRange(
    marks,
    state.selection.start,
    state.selection.end
  );
  const hasColor = colorCapability.text || colorCapability.background;
  const placeAbove = state.rect.top - 44 - TOOLBAR_GAP_PX > 0;
  const top = placeAbove
    ? state.rect.top - TOOLBAR_GAP_PX
    : state.rect.bottom + TOOLBAR_GAP_PX;
  const left = Math.min(
    Math.max(state.rect.left, 150),
    window.innerWidth - 150
  );

  const handleLinkKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applyLink(event.currentTarget.value);
    } else if (event.key === "Escape") {
      // Stop here so Escape only dismisses the editor (not other Escape
      // handlers), and preventDefault the browser's input-clear behavior.
      event.preventDefault();
      event.stopPropagation();
      setLinkDraft(null);
    }
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: mousedown is prevented only to preserve the text selection.
    <div
      className={cn(
        "fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md",
        placeAbove && "-translate-y-full",
        "-translate-x-1/2"
      )}
      data-selection-format-toolbar
      onMouseDown={(event) => {
        // Keep focus and the DOM selection in the field.
        event.preventDefault();
      }}
      role="toolbar"
      style={{ left, top }}
    >
      {linkDraft === null ? (
        <TooltipProvider>
          {MARK_BUTTONS.map(({ type, label, shortcut, icon: Icon }) => {
            const active = isMarkActive(
              marks,
              type,
              state.selection.start,
              state.selection.end
            );
            return (
              <Tooltip key={type}>
                <TooltipTrigger
                  render={
                    <button
                      aria-label={label}
                      aria-pressed={active}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        active && "bg-accent text-foreground"
                      )}
                      onClick={() => toggleMark(type)}
                      type="button"
                    >
                      <Icon className="size-4" />
                    </button>
                  }
                />
                <TooltipContent>
                  {label}
                  <Shortcut keys={shortcut} />
                </TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label="Link"
                  aria-pressed={activeLinkHref !== undefined}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    activeLinkHref !== undefined && "bg-accent text-foreground"
                  )}
                  onClick={() => setLinkDraft(activeLinkHref ?? "")}
                  type="button"
                >
                  <IconLink className="size-4" />
                </button>
              }
            />
            <TooltipContent>
              {activeLinkHref === undefined ? "Link" : "Edit link"}
              <Shortcut keys={LINK_HOTKEY} />
            </TooltipContent>
          </Tooltip>
          {hasColor ? (
            <DropdownMenu onOpenChange={setColorMenuOpen} open={colorMenuOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      aria-label="Block color"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-popup-open:bg-accent data-popup-open:text-foreground"
                      nativeButton
                    >
                      <IconPaint className="size-4" />
                    </DropdownMenuTrigger>
                  }
                />
                <TooltipContent>
                  Color
                  <Shortcut keys={APPLY_LAST_COLOR_HOTKEY} />
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-auto min-w-0">
                {colorCapability.text ? (
                  <div className="px-1 pb-1">
                    <div className="px-1 py-1.5 text-muted-foreground text-xs">
                      Text color
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {COLOR_SWATCHES.map((color) => (
                        <button
                          aria-label={
                            color
                              ? `${BLOCK_COLOR_DEFS[color].label} text`
                              : "Default text"
                          }
                          aria-pressed={(currentBlock.color ?? null) === (color ?? null)}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-accent",
                            (currentBlock.color ?? null) === (color ?? null) &&
                              "border-ring"
                          )}
                          key={color ?? "default"}
                          onClick={() => setBlockColor("color", color)}
                          type="button"
                        >
                          <BlockColorSwatch color={color} variant="text" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {colorCapability.background ? (
                  <div className="px-1 pb-1">
                    <div className="px-1 py-1.5 text-muted-foreground text-xs">
                      Background color
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {COLOR_SWATCHES.map((color) => (
                        <button
                          aria-label={
                            color
                              ? `${BLOCK_COLOR_DEFS[color].label} background`
                              : "Default background"
                          }
                          aria-pressed={
                            (currentBlock.backgroundColor ?? null) ===
                            (color ?? null)
                          }
                          className={cn(
                            "flex size-8 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-accent",
                            (currentBlock.backgroundColor ?? null) ===
                              (color ?? null) && "border-ring"
                          )}
                          key={color ?? "default"}
                          onClick={() =>
                            setBlockColor("backgroundColor", color)
                          }
                          type="button"
                        >
                          <BlockColorSwatch color={color} variant="background" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={applyLastUsedColors}>
                  Use most recent
                  <Shortcut className="ml-auto" keys={APPLY_LAST_COLOR_HOTKEY} />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </TooltipProvider>
      ) : (
        <div className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noAutofocus: the link editor opens on demand and should take focus immediately. */}
          <input
            autoFocus
            className="h-7 w-56 rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            defaultValue={linkDraft}
            onKeyDown={handleLinkKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder="Paste or type a link, then Enter"
            type="url"
          />
          {activeLinkHref !== undefined ? (
            <button
              aria-label="Remove link"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => applyLink("")}
              onMouseDown={(event) => event.stopPropagation()}
              title="Remove link"
              type="button"
            >
              <IconLink className="size-4" />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
