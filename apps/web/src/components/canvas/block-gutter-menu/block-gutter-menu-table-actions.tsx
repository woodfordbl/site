import {
  IconArrowsHorizontal,
  IconColumnInsertRight,
  IconRowInsertBottom,
  IconTableColumn,
  IconTableRow,
} from "@tabler/icons-react";
import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSwitchItem,
} from "@/components/ui/dropdown-menu.tsx";

export function BlockGutterMenuTableActions() {
  const {
    handleAddColumn,
    handleAddRow,
    handleFitToWidth,
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    lastTableRowId,
    tableBlock,
  } = useBlockGutterMenu();

  if (!tableBlock) {
    return null;
  }

  return (
    <>
      <DropdownMenuItem onClick={handleFitToWidth}>
        <IconArrowsHorizontal />
        Fit to width
      </DropdownMenuItem>
      <DropdownMenuSwitchItem
        checked={tableBlock.props.hasHeaderRow}
        onCheckedChange={handleToggleHeaderRow}
      >
        <IconTableRow />
        Header row
      </DropdownMenuSwitchItem>
      <DropdownMenuSwitchItem
        checked={tableBlock.props.hasHeaderColumn}
        onCheckedChange={handleToggleHeaderColumn}
      >
        <IconTableColumn />
        Header column
      </DropdownMenuSwitchItem>
      {lastTableRowId ? (
        <>
          <DropdownMenuItem onClick={handleAddRow}>
            <IconRowInsertBottom />
            Add row
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAddColumn}>
            <IconColumnInsertRight />
            Add column
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
