import { TableStructureHandle } from "@/components/blocks/types/table/table-structure-handle.tsx";

interface TableRowHandleProps {
  onStructureMenuOpenChange: (open: boolean) => void;
  rowId: string;
  tableId: string;
}

/** Left-edge handle on a body row — click opens row menu, drag reorders via canvas row DnD. */
export function TableRowHandle({
  onStructureMenuOpenChange,
  rowId,
  tableId,
}: TableRowHandleProps) {
  return (
    <TableStructureHandle
      axis="row"
      dragId={rowId}
      onStructureMenuOpenChange={onStructureMenuOpenChange}
      revealGroupClassName="group-hover/table-row:opacity-100"
      tableId={tableId}
      tableRowId={rowId}
      useCanvasRowSurface
    />
  );
}
