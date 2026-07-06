import { IconCopy, IconTrash } from "@tabler/icons-react";
import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";

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
        <Shortcut className="ml-auto" command="duplicate-block" />
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleDelete}>
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  );
}
