import {
  IconExternalLink,
  IconLink,
  IconRefresh,
  IconTypography,
} from "@tabler/icons-react";

import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
} from "@/components/ui/dropdown-menu.tsx";

export function BlockGutterMenuEmbedActions() {
  const {
    embedBlock,
    handleEmbedCopyLink,
    handleEmbedOpenInBrowser,
    handleEmbedReplace,
    handleEmbedToggleCaption,
  } = useBlockGutterMenu();

  if (!embedBlock) {
    return null;
  }

  return (
    <>
      <DropdownMenuItem onClick={handleEmbedReplace}>
        <IconRefresh />
        Replace
      </DropdownMenuItem>
      <DropdownMenuSwitchItem
        checked={embedBlock.props.showCaption ?? false}
        onCheckedChange={handleEmbedToggleCaption}
      >
        <IconTypography />
        Caption
      </DropdownMenuSwitchItem>
      <DropdownMenuItem onClick={handleEmbedOpenInBrowser}>
        <IconExternalLink />
        Open in browser
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleEmbedCopyLink}>
        <IconLink />
        Copy link
      </DropdownMenuItem>
    </>
  );
}
