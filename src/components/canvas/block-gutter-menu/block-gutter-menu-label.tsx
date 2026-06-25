import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu.tsx";

export function BlockGutterMenuLabel() {
  const { blockTypeLabel } = useBlockGutterMenu();

  if (!blockTypeLabel) {
    return null;
  }

  return <DropdownMenuLabel>{blockTypeLabel}</DropdownMenuLabel>;
}
