"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import { useInlineFormulaPage } from "@/components/editor/inline-formula-page.tsx";
import { useAllDatabases } from "@/db/queries/use-database.ts";
import { useFormulaUserFunctions } from "@/db/queries/use-formula-functions.ts";
import { useCaretTokenSession } from "@/hooks/use-caret-token-session.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import { insertFormulaToken } from "@/lib/blocks/inline-formula.ts";
import { getBlockMarks, withBlockRichText } from "@/lib/blocks/rich-text.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import {
  pageFormulaFields,
  pageFormulaPreviewRow,
  pageHasFormulaRowContext,
} from "@/lib/databases/page-formula-fields.ts";
import {
  type CaretTokenContext,
  FORMULA_TRIGGER_CHAR,
  readCaretTokenContext,
  restoreCaretAfterToken,
} from "@/lib/editor/caret-token-trigger.ts";

/**
 * `$`-triggered formula builder for the canvas. Inserts an inline formula
 * token (same mark as slash / `{{`) with the drafted expression, replacing
 * the `$…` run. Escape closes without insert and leaves `$` as plain text.
 *
 * The trigger is limited to plain `text` blocks. `$` is an ordinary character
 * people type for real (prices, shell snippets, variables), so it only takes
 * on trigger meaning in the one block type where prose formulas belong —
 * headings, quotes, checklist items, code, and table cells keep it literal.
 */

const POPOVER_WIDTH_PX = 720;

/** Block type the `$` trigger is offered in; everywhere else `$` is literal. */
const FORMULA_TRIGGER_BLOCK_TYPE = "text";

export function FormulaTokenPopover(): ReactNode {
  const canvas = useCanvasEditorContext();
  const model = useInlineFormulaPage();
  const relatedDatabases = useAllDatabases();
  const userFunctions = useFormulaUserFunctions();

  const { getRows } = canvas;
  const readContext = useCallback(() => {
    const context = readCaretTokenContext(FORMULA_TRIGGER_CHAR);
    if (context === null) {
      return null;
    }
    const rowId = context.field
      .closest("[data-canvas-row-id]")
      ?.getAttribute("data-canvas-row-id");
    const row = rowId ? findRowById(getRows(), rowId) : undefined;
    return row?.effectiveBlock.type === FORMULA_TRIGGER_BLOCK_TYPE
      ? context
      : null;
  }, [getRows]);
  const { anchorRect, close, context, freeze, frozen } =
    useCaretTokenSession(readContext);

  const frozenContextRef = useRef<CaretTokenContext | null>(null);
  useEffect(() => {
    if (context && !frozen) {
      frozenContextRef.current = context;
      freeze();
    }
    if (!(context || frozen)) {
      frozenContextRef.current = null;
    }
  }, [context, freeze, frozen]);

  const openContext = frozenContextRef.current ?? context;

  /** End the session without touching the field (the run is being replaced). */
  const clearSession = useCallback(() => {
    frozenContextRef.current = null;
    close();
  }, [close]);

  /**
   * Cancel: the typed `$…` stays exactly as typed, so hand the caret back to
   * the end of it. Without this the popover's focus grab strands the caret on
   * `<body>` and the run cannot be continued or deleted by typing.
   */
  const dismiss = useCallback(() => {
    const dismissed = frozenContextRef.current;
    clearSession();
    if (dismissed) {
      restoreCaretAfterToken(dismissed);
    }
  }, [clearSession]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: relatedDatabases is the invalidation signal, not an input
  const relations = useMemo(
    () => localFormulaRelationResolver(),
    [relatedDatabases]
  );
  const fields = useMemo(
    () => pageFormulaFields(model?.databaseFields, model?.primaryFieldId),
    [model?.databaseFields, model?.primaryFieldId]
  );
  const previewRows = useMemo(
    () =>
      model === null
        ? []
        : [pageFormulaPreviewRow(model.page, model.cellValues)],
    [model]
  );

  const handleInsert = useCallback(
    (expression: string) => {
      const target = frozenContextRef.current;
      if (!target) {
        dismiss();
        return;
      }
      const rowId = target.field
        .closest("[data-canvas-row-id]")
        ?.getAttribute("data-canvas-row-id");
      if (!rowId) {
        dismiss();
        return;
      }
      const row = findRowById(canvas.getRows(), rowId);
      const block = row?.effectiveBlock;
      if (!block) {
        dismiss();
        return;
      }
      const trimmed = expression.trim();
      const inserted = insertFormulaToken(
        getTextFromBlock(block),
        getBlockMarks(block),
        { start: target.start, end: target.end },
        trimmed
      );
      canvas.dispatch({
        type: "row.update",
        rowId,
        block: withBlockRichText(block, inserted.text, inserted.marks),
      });
      // The run is gone (replaced by the token), so the cancel-path caret
      // restore would land on a stale offset — end the session plainly.
      clearSession();
    },
    [canvas, clearSession, dismiss]
  );

  useEffect(() => {
    if (!openContext) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [dismiss, openContext]);

  useEffect(() => {
    if (!openContext) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.defaultPrevented) {
        return;
      }
      if (document.activeElement !== openContext.field) {
        return;
      }
      dismiss();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [dismiss, openContext]);

  if (!(openContext && anchorRect)) {
    return null;
  }

  const top = Math.max(8, anchorRect.bottom + 6);
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH_PX - 8)
  );

  return createPortal(
    <div
      className="fixed z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
      data-caret-token-popover=""
      style={{
        top,
        left,
        width: Math.min(POPOVER_WIDTH_PX, window.innerWidth - 16),
      }}
    >
      <div className="px-0.5 pb-2 font-medium text-muted-foreground text-xs">
        Formula
      </div>
      <FormulaEditorPanel
        expression={openContext.query}
        fields={fields}
        key={`${openContext.start}:${openContext.query}`}
        layout="popover"
        onCancel={dismiss}
        onSave={handleInsert}
        previewRows={previewRows}
        relatedDatabases={relatedDatabases}
        relations={relations}
        thisRowInScope={pageHasFormulaRowContext(model)}
        userFunctions={userFunctions}
      />
    </div>,
    document.body
  );
}
