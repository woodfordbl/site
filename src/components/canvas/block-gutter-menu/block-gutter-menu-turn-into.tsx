import { IconExchange } from "@tabler/icons-react";
import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";

export function BlockGutterMenuTurnInto() {
  const { canTurnInto, handleTurnInto, turnIntoItems, turnIntoValue } =
    useBlockGutterMenu();

  if (!canTurnInto) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconExchange />
        Turn into
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        align="center"
        className="min-w-40"
        data-canvas-row-menu
      >
        <DropdownMenuRadioGroup
          onValueChange={handleTurnInto}
          value={turnIntoValue}
        >
          {turnIntoItems.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuRadioItem key={item.key} value={item.key}>
                <Icon />
                {item.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
