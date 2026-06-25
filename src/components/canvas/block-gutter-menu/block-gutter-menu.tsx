import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import {
  type BlockGutterMenuProps,
  BlockGutterMenuProvider,
  useBlockGutterMenu,
} from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { BlockGutterMenuLabel } from "@/components/canvas/block-gutter-menu/block-gutter-menu-label.tsx";
import { BlockGutterMenuRowActions } from "@/components/canvas/block-gutter-menu/block-gutter-menu-row-actions.tsx";
import { BlockGutterMenuTableActions } from "@/components/canvas/block-gutter-menu/block-gutter-menu-table-actions.tsx";
import { BlockGutterMenuTurnInto } from "@/components/canvas/block-gutter-menu/block-gutter-menu-turn-into.tsx";
import { BlockGutterMenuViewOptions } from "@/components/canvas/block-gutter-menu/block-gutter-menu-view-options.tsx";
import { DropdownMenuGroup } from "@/components/ui/dropdown-menu.tsx";

export type { BlockViewOption } from "@/components/canvas/block-gutter-menu/block-gutter-menu-config.ts";

function BlockGutterMenuContent() {
  const { actionItems, menuOpen, rowId } = useBlockGutterMenu();

  return (
    <DropdownMenuGroup>
      <ActionMenuSearchSection
        activeKey={menuOpen ? rowId : null}
        items={actionItems}
      >
        <BlockGutterMenuLabel />
        <BlockGutterMenuTurnInto />
        <BlockGutterMenuViewOptions />
        <BlockGutterMenuTableActions />
        <BlockGutterMenuRowActions />
      </ActionMenuSearchSection>
    </DropdownMenuGroup>
  );
}

export function BlockGutterMenu(props: BlockGutterMenuProps) {
  return (
    <BlockGutterMenuProvider {...props}>
      <BlockGutterMenuContent />
    </BlockGutterMenuProvider>
  );
}
