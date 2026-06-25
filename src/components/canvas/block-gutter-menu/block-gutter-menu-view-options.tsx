import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";

export function BlockGutterMenuViewOptions() {
  const { handleViewToggle, resolvedViewChecks, viewOptions } =
    useBlockGutterMenu();

  if (!viewOptions) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{viewOptions.label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40" data-canvas-row-menu>
        {viewOptions.items.map((item) => (
          <DropdownMenuCheckboxItem
            checked={resolvedViewChecks[item.id] ?? item.checked}
            key={item.id}
            onCheckedChange={(checked) => {
              handleViewToggle(item.id, checked === true);
            }}
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
