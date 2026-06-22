import { TableStructureHandle } from "@/components/blocks/types/table/table-structure-handle.tsx";

interface TableColumnHandleProps {
  columnIndex: number;
  onStructureMenuOpenChange: (open: boolean) => void;
  tableId: string;
}

/** Top-edge handle on a header column — click opens column menu, drag reorders columns. */
export function TableColumnHandle({
  columnIndex,
  onStructureMenuOpenChange,
  tableId,
}: TableColumnHandleProps) {
  return (
    <TableStructureHandle
      axis="column"
      columnIndex={columnIndex}
      dragId={`${tableId}:${columnIndex}`}
      onStructureMenuOpenChange={onStructureMenuOpenChange}
      tableId={tableId}
    />
  );
}
