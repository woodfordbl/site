import {
  IconCopy,
  IconExchange,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { getSlashMenuItems } from "@/components/blocks/registry.ts";
import {
  useCanvasEditorContext,
  useCanvasEditorState,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useCanvasMenu } from "@/components/canvas/canvas-menu-context.tsx";
import {
  DropdownMenuCheckboxItem,
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
  const { dispatch } = useCanvasEditorContext();
  const { rows } = useCanvasEditorState();
  const session = blockActionsSession;
  const [viewChecks, setViewChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!session?.viewOptions) {
      setViewChecks({});
      return;
    }
    setViewChecks(
      Object.fromEntries(
        session.viewOptions.items.map((item) => [item.id, item.checked])
      )
    );
  }, [session]);

  if (!session) {
    return null;
  }

  const row = rows.find((entry) => entry.rowId === session.rowId);
  const tableBlock =
    row?.effectiveBlock.type === "table" ? row.effectiveBlock : null;
  const lastTableRowId = row?.children.at(-1)?.rowId;
  const tableColumnCount = row?.children[0]?.children.length ?? 0;

  const turnIntoItems = getSlashMenuItems();
  const currentTurnIntoLabel = turnIntoItems.find(
    (item) => item.key === session.turnIntoValue
  )?.label;

  const handleViewToggle = (id: string, checked: boolean) => {
    if (id !== "showTitle" && id !== "showUrl") {
      return;
    }

    const row = rows.find((entry) => entry.rowId === session.rowId);
    const block = row?.effectiveBlock;
    if (block?.type !== "embed") {
      return;
    }

    setViewChecks((current) => ({ ...current, [id]: checked }));
    dispatch({
      type: "row.update",
      rowId: session.rowId,
      block: {
        ...block,
        props: {
          ...block.props,
          [id]: checked,
        },
      },
    });
  };

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
      {session.viewOptions ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {session.viewOptions.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40" data-canvas-row-menu>
            {session.viewOptions.items.map((item) => (
              <DropdownMenuCheckboxItem
                checked={viewChecks[item.id] ?? item.checked}
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
      ) : null}
      {tableBlock && lastTableRowId ? (
        <>
          <DropdownMenuItem
            onClick={() => {
              dispatch({
                type: "table.toggleHeaderRow",
                tableId: tableBlock.id,
                enabled: !tableBlock.props.hasHeaderRow,
              });
              closeMenu();
            }}
          >
            <IconTable />
            {tableBlock.props.hasHeaderRow ? "Header row off" : "Header row on"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              dispatch({
                type: "table.addRow",
                tableRowId: lastTableRowId,
                edge: "after",
              });
              closeMenu();
            }}
          >
            <IconTable />
            Add row
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              dispatch({
                type: "table.addColumn",
                tableId: tableBlock.id,
                columnIndex: Math.max(0, tableColumnCount - 1),
                edge: "after",
              });
              closeMenu();
            }}
          >
            <IconTable />
            Add column
          </DropdownMenuItem>
        </>
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
