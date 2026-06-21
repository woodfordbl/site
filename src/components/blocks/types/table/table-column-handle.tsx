import { TableStructureHandle } from "@/components/blocks/types/table/table-structure-handle.tsx";

interface TableColumnHandleProps {
  columnIndex: number;
  onStructureSelect: () => void;
  tableId: string;
}

/** Top-edge handle on a header column — click opens column menu, drag reorders columns. */
export function TableColumnHandle({
  columnIndex,
  onStructureSelect,
  tableId,
}: TableColumnHandleProps) {
  return (
    <TableStructureHandle
      axis="column"
      columnIndex={columnIndex}
      dragId={`${tableId}:${columnIndex}`}
      onStructureSelect={onStructureSelect}
      tableId={tableId}
    />
  );
}
