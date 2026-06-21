import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

interface ContainerGutterInsertActions {
  insertAfter: (rowId: string) => void;
  insertAtScopeStart: (parentId: string | null) => void;
  insertBefore: (rowId: string) => void;
}

/** Gutter + on a container row: insert after last content or at scope start. */
export function handleContainerGutterInsert(
  row: CanvasRow,
  edge: "before" | "after",
  actions: ContainerGutterInsertActions
): void {
  if (edge === "before") {
    actions.insertBefore(row.rowId);
    return;
  }

  if (row.effectiveBlock.type === "columns") {
    const lastColumn = row.children.at(-1);
    if (lastColumn) {
      const lastInColumn = lastColumn.children.at(-1);
      if (lastInColumn) {
        actions.insertAfter(lastInColumn.rowId);
        return;
      }
      actions.insertAtScopeStart(lastColumn.effectiveBlock.id);
      return;
    }
  } else {
    const lastChild = row.children.at(-1);
    if (lastChild) {
      actions.insertAfter(lastChild.rowId);
      return;
    }
  }

  actions.insertAtScopeStart(row.effectiveBlock.id);
}
