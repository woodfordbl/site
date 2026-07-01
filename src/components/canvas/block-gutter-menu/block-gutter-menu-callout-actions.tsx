import { IconMoodOff, IconMoodSmile } from "@tabler/icons-react";

import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";

/** Callout-only "Add icon" / "Remove icon" entries for the block actions menu. */
export function BlockGutterMenuCalloutActions() {
  const { calloutBlock, handleAddCalloutIcon, handleRemoveCalloutIcon } =
    useBlockGutterMenu();

  if (!calloutBlock) {
    return null;
  }

  if (calloutBlock.props.icon) {
    return (
      <DropdownMenuItem onClick={handleRemoveCalloutIcon}>
        <IconMoodOff />
        Remove icon
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
