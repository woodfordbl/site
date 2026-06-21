import { TableStructureHandle } from "@/components/blocks/types/table/table-structure-handle.tsx";

interface TableRowHandleProps {
  onStructureSelect: () => void;
  rowId: string;
  tableId: string;
}

/** Left-edge handle on a body row — click opens row menu, drag reorders via canvas row DnD. */
export function TableRowHandle({
  onStructureSelect,
  rowId,
  tableId,
}: TableRowHandleProps) {
  return (
    <TableStructureHandle
      axis="row"
      dragId={rowId}
      onStructureSelect={onStructureSelect}
      revealGroupClassName="group-hover/table-row:opacity-100"
      tableId={tableId}
      tableRowId={rowId}
      useCanvasRowSurface
    />
  );
}
