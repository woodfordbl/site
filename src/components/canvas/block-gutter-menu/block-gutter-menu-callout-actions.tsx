import { IconPencil } from "@tabler/icons-react";

import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";

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
      <PageIconDisplay icon={DEFAULT_CALLOUT_ICON} />
      Add icon
    </DropdownMenuItem>
  );
}
