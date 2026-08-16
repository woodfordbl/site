"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import { useInlineFormulaPage } from "@/components/editor/inline-formula-page.tsx";
import { useAllDatabases } from "@/db/queries/use-database.ts";
import { useFormulaUserFunctions } from "@/db/queries/use-formula-functions.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useCaretTokenSession } from "@/hooks/use-caret-token-session.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import { insertFormulaToken } from "@/lib/blocks/inline-formula.ts";
import { getBlockMarks, withBlockRichText } from "@/lib/blocks/rich-text.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import {
  pageFormulaFields,
  pageFormulaPreviewRow,
} from "@/lib/databases/page-formula-fields.ts";
import {
  type CaretTokenContext,
  readCaretTokenContext,
} from "@/lib/editor/caret-token-trigger.ts";

/**
 * `#`-triggered formula builder for the canvas. Inserts an inline formula
 * token (same mark as slash / `{{`) with the drafted expression, replacing
 * the `#…` run. Escape closes without insert and leaves `#` as plain text so
 * markdown `#` + Space headings still work.
 *
 * Desktop-only, like the typed slash command: on coarse pointers the trigger
 * never fires — a `#` typed on a phone keyboard is far more often a hashtag
 * or a heading than a formula, and the mobile entry points are the editor
 * toolbar's formula button and tapping an existing token (both open the
 * studio drawer via {@link InlineFormulaPopover}).
 */

const POPOVER_WIDTH_PX = 720;

export function FormulaTokenPopover(): ReactNode {
  const canvas = useCanvasEditorContext();
  const coarsePointer = useIsCoarsePrimaryPointer();
  const model = useInlineFormulaPage();
  const relatedDatabases = useAllDatabases();
  const userFunctions = useFormulaUserFunctions();

  const readContext = useCallback(
    () => (coarsePointer ? null : readCaretTokenContext("#")),
    [coarsePointer]
  );
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

  const dismiss = useCallback(() => {
    frozenContextRef.current = null;
    close();
  }, [close]);

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
      dismiss();
    },
    [canvas, dismiss]
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

  if (!openContext) {
    return null;
  }

  if (!anchorRect) {
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
        userFunctions={userFunctions}
      />
    </div>,
    document.body
  );
}
