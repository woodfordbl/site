import { IconCopy, IconTrash } from "@tabler/icons-react";
import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";

export function BlockGutterMenuRowActions() {
  const {
    blockTypeLabel,
    handleDelete,
    handleDuplicate,
    hasBlockSpecificActions,
  } = useBlockGutterMenu();

  return (
    <>
      {hasBlockSpecificActions || blockTypeLabel ? (
        <DropdownMenuSeparator />
      ) : null}
      <DropdownMenuItem onClick={handleDuplicate}>
        <IconCopy />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleDelete}>
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  );
}
