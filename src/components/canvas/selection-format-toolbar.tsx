import {
  IconBold,
  IconCode,
  IconItalic,
  IconPaint,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react";
import {
  type ComponentType,
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
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  BLOCK_COLOR_DEFS,
  BLOCK_COLOR_IDS,
} from "@/lib/blocks/block-colors.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import {
  blockSupportsInlineMarks,
  getBlockMarks,
  isMarkActive,
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
const DEFAULT_VALUE = "default";

interface ToolbarState {
  rect: { bottom: number; left: number; top: number; width: number };
  rowId: string;
  selection: FieldSelection;
}

const MARK_BUTTONS: Array<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  type: InlineMarkType;
}> = [
  { type: "bold", label: "Bold", icon: IconBold },
  { type: "italic", label: "Italic", icon: IconItalic },
  { type: "underline", label: "Underline", icon: IconUnderline },
  { type: "strikethrough", label: "Strikethrough", icon: IconStrikethrough },
  { type: "code", label: "Inline code", icon: IconCode },
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
  const colorMenuOpenRef = useRef(false);
  colorMenuOpenRef.current = colorMenuOpen;

  useEffect(() => {
    const update = () => {
      // Keep the toolbar (and its open color menu) alive while the menu
      // steals the DOM selection.
      if (colorMenuOpenRef.current) {
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

  const currentBlock = state
    ? canvas.getRows().find((row) => row.rowId === state.rowId)?.effectiveBlock
    : undefined;

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
      canvas.dispatch({
        type: "row.update",
        rowId: state.rowId,
        block: { ...currentBlock, [key]: color },
      });
    },
    [canvas, currentBlock, state]
  );

  if (!(state && currentBlock && blockSupportsInlineMarks(currentBlock))) {
    return null;
  }

  const marks = getBlockMarks(currentBlock);
  const placeAbove = state.rect.top - 44 - TOOLBAR_GAP_PX > 0;
  const top = placeAbove
    ? state.rect.top - TOOLBAR_GAP_PX
    : state.rect.bottom + TOOLBAR_GAP_PX;
  const left = Math.min(
    Math.max(state.rect.left, 150),
    window.innerWidth - 150
  );

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
      {MARK_BUTTONS.map(({ type, label, icon: Icon }) => {
        const active = isMarkActive(
          marks,
          type,
          state.selection.start,
          state.selection.end
        );
        return (
          <button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "bg-accent text-foreground"
            )}
            key={type}
            onClick={() => toggleMark(type)}
            title={label}
            type="button"
          >
            <Icon className="size-4" />
          </button>
        );
      })}
      <DropdownMenu onOpenChange={setColorMenuOpen} open={colorMenuOpen}>
        <DropdownMenuTrigger
          aria-label="Block color"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-popup-open:bg-accent data-popup-open:text-foreground"
          nativeButton
          title="Block color"
        >
          <IconPaint className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Text color</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                setBlockColor(
                  "color",
                  value === DEFAULT_VALUE ? undefined : (value as BlockColor)
                );
              }}
              value={currentBlock.color ?? DEFAULT_VALUE}
            >
              <DropdownMenuRadioItem value={DEFAULT_VALUE}>
                <BlockColorSwatch color={undefined} variant="text" />
                Default text
              </DropdownMenuRadioItem>
              {BLOCK_COLOR_IDS.map((color) => (
                <DropdownMenuRadioItem key={color} value={color}>
                  <BlockColorSwatch color={color} variant="text" />
                  {BLOCK_COLOR_DEFS[color].label} text
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Background color</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                setBlockColor(
                  "backgroundColor",
                  value === DEFAULT_VALUE ? undefined : (value as BlockColor)
                );
              }}
              value={currentBlock.backgroundColor ?? DEFAULT_VALUE}
            >
              <DropdownMenuRadioItem value={DEFAULT_VALUE}>
                <BlockColorSwatch color={undefined} variant="background" />
                Default background
              </DropdownMenuRadioItem>
              {BLOCK_COLOR_IDS.map((color) => (
                <DropdownMenuRadioItem key={color} value={color}>
                  <BlockColorSwatch color={color} variant="background" />
                  {BLOCK_COLOR_DEFS[color].label} background
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
