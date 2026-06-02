import { IconCopy, IconExchange, IconTrash } from "@tabler/icons-react";
import { getSlashMenuItems } from "@/components/blocks/registry.ts";
import { useCanvasMenu } from "@/components/canvas/canvas-menu-context.tsx";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
export function CanvasMenuBlockActions() {
  const { blockActionsSession, closeMenu } = useCanvasMenu();
  const session = blockActionsSession;

  if (!session) {
    return null;
  }

  const turnIntoItems = getSlashMenuItems();
  const currentTurnIntoLabel = turnIntoItems.find(
    (item) => item.key === session.turnIntoValue
  )?.label;

  return (
    <DropdownMenuGroup>
      {currentTurnIntoLabel ? (
        <DropdownMenuLabel>{currentTurnIntoLabel}</DropdownMenuLabel>
      ) : null}
      {session.canTurnInto ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconExchange />
            Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40" data-canvas-row-menu>
            <DropdownMenuRadioGroup
              onValueChange={(key) => {
                const item = turnIntoItems.find(
                  (turnIntoItem) => turnIntoItem.key === key
                );
                if (!item || key === session.turnIntoValue) {
                  return;
                }
                session.onConvert(item);
                closeMenu();
              }}
              value={session.turnIntoValue}
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
      ) : null}
      <DropdownMenuItem
        onClick={() => {
          session.onDuplicate();
          closeMenu();
        }}
      >
        <IconCopy />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => session.onDelete()}>
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}
