import { IconMoodSmile, IconPencil } from "@tabler/icons-react";

import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";

/** Callout-only "Edit icon" / "Add icon" entry for the block actions menu. */
export function BlockGutterMenuCalloutActions() {
  const { calloutBlock, handleAddCalloutIcon, handleEditCalloutIcon } =
    useBlockGutterMenu();

  if (!calloutBlock) {
    return null;
  }

  if (calloutBlock.props.icon) {
    return (
      <DropdownMenuItem onClick={handleEditCalloutIcon}>
        <IconPencil />
        Edit icon
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem onClick={handleAddCalloutIcon}>
      <IconMoodSmile />
      Add icon
    </DropdownMenuItem>
  );
}
