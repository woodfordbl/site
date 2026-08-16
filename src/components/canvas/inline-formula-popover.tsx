import { useCallback, useEffect, useMemo, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import { useInlineFormulaPage } from "@/components/editor/inline-formula-page.tsx";
import { Drawer, DrawerContent } from "@/components/ui/drawer.tsx";
import { useAllDatabases } from "@/db/queries/use-database.ts";
import { useFormulaUserFunctions } from "@/db/queries/use-formula-functions.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import {
  formulaTokenAt,
  setFormulaTokenExpression,
} from "@/lib/blocks/inline-formula.ts";
import { getBlockMarks, withBlockRichText } from "@/lib/blocks/rich-text.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import {
  pageFormulaFields,
  pageFormulaPreviewRow,
} from "@/lib/databases/page-formula-fields.ts";
import {
  INLINE_FORMULA_EDIT_EVENT,
  type InlineFormulaEditRequest,
} from "@/lib/editor/inline-formula-edit-request.ts";
import {
  collectInlineFormulaTokens,
  FORMULA_TOKEN_SELECTOR,
} from "@/lib/editor/rich-text-dom.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Click an inline formula token, edit its expression in place.
 *
 * Positioned like {@link SelectionFormatToolbar} — one instance per canvas,
 * anchored to the clicked token's rect — because it is the same kind of
 * surface: a light editor that appears over the prose you are already reading,
 * not a modal that takes you away from it.
 *
 * Saving rewrites only the mark's expression. The document text is untouched:
 * a token is one sentinel character whatever the formula says, so re-editing a
 * formula shifts no offsets, rebases no marks, and moves no caret.
 */

/** Space between the token and the panel. */
const POPOVER_GAP_PX = 8;
/**
 * Sized for the panel's two-column `popover` form — editor and detail strip
 * on the left, reference browser on the right. The height is an estimate used
 * only to decide which side of the token to open on.
 */
const POPOVER_WIDTH_PX = 720;
const POPOVER_HEIGHT_PX = 340;
const VIEWPORT_MARGIN_PX = 12;

/**
 * Everything that counts as "inside the panel" for dismissal: the panel
 * itself, plus the surfaces it portals OUT of itself — the chip menu, the
 * preview-row select, the mobile drawers. Those render at the document root,
 * so a plain `contains` check on the panel would read a click on a menu item
 * as a click outside and close the thing the menu belongs to.
 */
const PANEL_SURFACE_SELECTOR = [
  "[data-inline-formula-popover]",
  ".overlay-popover-surface",
  '[data-slot^="drawer"]',
].join(",");

function isInsidePanel(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest(PANEL_SURFACE_SELECTOR));
}

interface PopoverTarget {
  expression: string;
  /** Model offset of the token being edited — its identity in the marks. */
  offset: number;
  rect: { bottom: number; left: number; top: number };
  rowId: string;
}

/**
 * The token under `node`, with the model offset it sits at. Null when the
 * click was not on a token, or landed in a field with no canvas row (a
 * database cell, a title) — neither of which this popover edits.
 */
function resolveTarget(node: Node | null): PopoverTarget | null {
  const element = node instanceof Element ? node : node?.parentElement;
  const token = element?.closest(FORMULA_TOKEN_SELECTOR);
  if (!(token instanceof HTMLElement)) {
    return null;
  }
  const field = token.closest("[data-rich-text-field]");
  const rowId = token
    .closest("[data-canvas-row-id]")
    ?.getAttribute("data-canvas-row-id");
  if (!(field instanceof HTMLElement && rowId)) {
    return null;
  }
  const position = collectInlineFormulaTokens(field).find(
    (candidate) => candidate.element === token
  );
  if (!position) {
    return null;
  }
  const rect = token.getBoundingClientRect();
  return {
    expression: token.dataset.expression ?? "",
    offset: position.offset,
    rect: { bottom: rect.bottom, left: rect.left, top: rect.top },
    rowId,
  };
}

/**
 * Slop around a token's rect for touch hit-testing. Small on purpose: its job
 * is to forgive a slightly-off fingertip, not to grow the target — iOS Safari
 * already maps a tap in the blank run to the right of a line onto the line's
 * LAST inline element, and a generous slop would re-create exactly the bug
 * the rect check exists to prevent (a tap meant to place the caret after the
 * token reading as a tap ON the token).
 */
const TOUCH_SLOP_PX = 4;

/**
 * The token target for a touch press, only when the touch point actually
 * falls on the token's box (± slop). `resolveTarget` alone is not enough on
 * touch: the browser's tap heuristics can deliver a token as `event.target`
 * for a press that was visually nowhere near it.
 */
function resolveTouchTarget(event: PointerEvent): PopoverTarget | null {
  const element =
    event.target instanceof Element
      ? event.target
      : (event.target as Node | null)?.parentElement;
  const token = element?.closest(FORMULA_TOKEN_SELECTOR);
  if (!(token instanceof HTMLElement)) {
    return null;
  }
  const rect = token.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left - TOUCH_SLOP_PX &&
    event.clientX <= rect.right + TOUCH_SLOP_PX &&
    event.clientY >= rect.top - TOUCH_SLOP_PX &&
    event.clientY <= rect.bottom + TOUCH_SLOP_PX;
  return inside ? resolveTarget(token) : null;
}

/** The token at `offset` in `rowId`'s field, once the canvas has rendered it. */
function targetForToken(rowId: string, offset: number): PopoverTarget | null {
  const field = document
    .querySelector(`[data-canvas-row-id="${CSS.escape(rowId)}"]`)
    ?.querySelector("[data-rich-text-field]");
  if (!(field instanceof HTMLElement)) {
    return null;
  }
  const position = collectInlineFormulaTokens(field).find(
    (candidate) => candidate.offset === offset
  );
  return position ? resolveTarget(position.element) : null;
}

export function InlineFormulaPopover() {
  const canvas = useCanvasEditorContext();
  const coarsePointer = useIsCoarsePrimaryPointer();
  const model = useInlineFormulaPage();
  const relatedDatabases = useAllDatabases();
  const userFunctions = useFormulaUserFunctions();
  const [target, setTarget] = useState<PopoverTarget | null>(null);

  useEffect(() => {
    /**
     * Did the press behind the pending click land inside the panel? Recorded
     * at pointerdown because the click is too late to ask: a control that
     * unmounts on activation — a chip-menu row is gone the instant it is
     * picked — is already detached by the time the click reaches the
     * document, and `closest` on a detached node walks a stump that no longer
     * reaches the panel surface. Read as "outside", that closed the very
     * panel the menu belonged to.
     */
    let pressedInsidePanel = false;
    /**
     * Deadline for swallowing the tap's synthetic click after a touch open.
     * The drawer mounts between pointerup and the click the browser then
     * synthesizes, so that click lands on the drawer's overlay — which vaul
     * reads as an outside click and closes the drawer it just opened.
     */
    let swallowClickDeadline = 0;
    const handlePointerDown = (event: PointerEvent) => {
      pressedInsidePanel = isInsidePanel(event.target as Node | null);
      if (event.pointerType !== "mouse" && resolveTouchTarget(event)) {
        // A touch press on a token is claimed before the browser acts on it:
        // preventing the pointerdown default stops the field from taking
        // focus (no keyboard flash under the drawer) and suppresses the
        // compatibility mouse events. Scrolling is unaffected — touch panning
        // is governed by `touch-action`, and a pan that starts here ends in
        // `pointercancel`, so it never reaches the open below.
        event.preventDefault();
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        return;
      }
      const next = resolveTouchTarget(event);
      if (next) {
        // Touch opens on pointerup rather than waiting for a click: iOS
        // Safari does not reliably synthesize one for a tap on a
        // `contenteditable=false` island inside an editable field — the tap
        // gets consumed by selection handling, which left tokens un-tappable
        // on phones.
        swallowClickDeadline = performance.now() + 400;
        setTarget(next);
      }
    };
    const handleClickCapture = (event: MouseEvent) => {
      if (performance.now() <= swallowClickDeadline) {
        // The opening tap's synthetic click — it belongs to the gesture that
        // opened the drawer, not to anything now under the finger.
        swallowClickDeadline = 0;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleClick = (event: MouseEvent) => {
      const pressedInside = pressedInsidePanel;
      // A keyboard-activated click has no press of its own, and must not
      // inherit the verdict of whatever was last pressed.
      pressedInsidePanel = false;
      const node = event.target as Node | null;
      const next = resolveTarget(node);
      if (next) {
        // The token is `contenteditable=false`; claiming the click keeps the
        // browser from dropping a caret beside it as the panel opens.
        event.preventDefault();
        setTarget(next);
        return;
      }
      if (pressedInside || isInsidePanel(node)) {
        // Working inside the panel — typing, picking a reference, opening a
        // chip menu. Only a click that leaves it dismisses.
        return;
      }
      setTarget(null);
    };
    const handleEditRequest = (event: Event) => {
      const { offset, rowId } = (event as CustomEvent<InlineFormulaEditRequest>)
        .detail;
      // A timeout, not rAF: the canvas rebuilds the field in a layout effect
      // during this dispatch's commit, and rAF is throttled to nothing in a
      // background tab — where a freshly inserted token would then never open.
      setTimeout(() => {
        setTarget(targetForToken(rowId, offset));
      }, 0);
    };
    // The press listener is in capture so nothing can consume it first — the
    // click stays in bubble, where it has always been, to keep the panel
    // mounting after the canvas has finished with the press.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("click", handleClickCapture, true);
    document.addEventListener("click", handleClick);
    document.addEventListener(INLINE_FORMULA_EDIT_EVENT, handleEditRequest);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("click", handleClickCapture, true);
      document.removeEventListener("click", handleClick);
      document.removeEventListener(
        INLINE_FORMULA_EDIT_EVENT,
        handleEditRequest
      );
    };
  }, []);

  // A token's screen position is only valid until the page moves under it.
  useEffect(() => {
    if (target === null) {
      return;
    }
    const close = () => {
      setTarget(null);
    };
    // Escape is handled at the document, in capture: the editor's CM6 instance
    // consumes its own keydowns, so a handler on the panel would never see it.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    // Capture, so a scroll in any ancestor counts — but the panel's own
    // reference list scrolls too, and that must not dismiss it.
    const handleScroll = (event: Event) => {
      if (!isInsidePanel(event.target as Node | null)) {
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    // Reposition-driven dismissal is desktop-only. The mobile studio is a
    // viewport-fixed drawer with nothing to re-anchor, and on a phone both
    // events are on-screen-keyboard artifacts rather than the page moving:
    // focusing the editor or the tray's search field opens the keyboard,
    // which fires `resize` and scrolls the document — closing the drawer the
    // moment the user started typing in it.
    if (!coarsePointer) {
      window.addEventListener("resize", close);
      window.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [coarsePointer, target]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: relatedDatabases is the invalidation signal, not an input
  const relations = useMemo(
    () => localFormulaRelationResolver(),
    [relatedDatabases]
  );
  const fields = useMemo(
    () => pageFormulaFields(model?.databaseFields),
    [model?.databaseFields]
  );
  const previewRows = useMemo(
    () =>
      model === null
        ? []
        : [pageFormulaPreviewRow(model.page, model.cellValues)],
    [model]
  );

  const handleSave = useCallback(
    (expression: string) => {
      if (target === null) {
        return;
      }
      setTarget(null);
      const row = findRowById(canvas.getRows(), target.rowId);
      const block = row?.effectiveBlock;
      if (!block) {
        return;
      }
      const marks = getBlockMarks(block);
      // Guard against a stale offset: the document may have changed under an
      // open panel, and rewriting the wrong token is worse than doing nothing.
      if (formulaTokenAt(marks, target.offset) === null) {
        return;
      }
      canvas.dispatch({
        type: "row.update",
        rowId: target.rowId,
        // Text unchanged — only the mark's expression moves.
        block: withBlockRichText(
          block,
          getTextFromBlock(block),
          setFormulaTokenExpression(marks, target.offset, expression)
        ),
      });
    },
    [canvas, target]
  );

  if (target === null) {
    return null;
  }

  if (coarsePointer) {
    // Phones edit tokens in the full-screen studio drawer — the anchored
    // desktop popover renders under the on-screen keyboard (see
    // FormulaTokenPopover). data-slot="drawer-content" already counts as
    // "inside the panel" for this popover's dismissal selector.
    return (
      <Drawer
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
          }
        }}
        open
      >
        <DrawerContent hasTitle={false} variant="full">
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-1">
            <FormulaEditorPanel
              expression={target.expression}
              fields={fields}
              layout="studio"
              onCancel={() => {
                setTarget(null);
              }}
              onSave={handleSave}
              previewRows={previewRows}
              relatedDatabases={relatedDatabases}
              relations={relations}
              userFunctions={userFunctions}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const placeAbove =
    target.rect.bottom + POPOVER_GAP_PX + POPOVER_HEIGHT_PX >
      window.innerHeight && target.rect.top > POPOVER_HEIGHT_PX;
  const top = placeAbove
    ? target.rect.top - POPOVER_GAP_PX
    : target.rect.bottom + POPOVER_GAP_PX;
  const left = Math.min(
    Math.max(target.rect.left, VIEWPORT_MARGIN_PX),
    Math.max(
      VIEWPORT_MARGIN_PX,
      window.innerWidth - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX
    )
  );

  return (
    <div
      aria-label="Edit formula"
      className={cn(
        "fixed z-50 rounded-lg border border-border bg-popover p-3 shadow-md",
        placeAbove && "-translate-y-full"
      )}
      data-inline-formula-popover
      role="dialog"
      style={{
        left,
        top,
        width: Math.min(
          POPOVER_WIDTH_PX,
          window.innerWidth - 2 * VIEWPORT_MARGIN_PX
        ),
      }}
    >
      {/* The `wide` form drops the panel's own label — the host owns it. */}
      <div className="px-0.5 pb-2 font-medium text-muted-foreground text-xs">
        Formula
      </div>
      <FormulaEditorPanel
        expression={target.expression}
        fields={fields}
        layout="popover"
        onCancel={() => {
          setTarget(null);
        }}
        onSave={handleSave}
        previewRows={previewRows}
        relatedDatabases={relatedDatabases}
        relations={relations}
        userFunctions={userFunctions}
      />
    </div>
  );
}
