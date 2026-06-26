"use client";

import {
  IconArrowsHorizontal,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconColumnInsertRight,
  IconCopy,
  IconExchange,
  IconRowInsertBottom,
  IconTableColumn,
  IconTableRow,
  IconTrash,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { DrawerTitle } from "@/components/ui/drawer.tsx";
import { cn } from "@/lib/utils.ts";

interface DrawerRowProps {
  destructive?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  sublabel?: string;
  trailing?: ReactNode;
}

function DrawerRow({
  destructive,
  icon,
  label,
  onClick,
  sublabel,
  trailing,
}: DrawerRowProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] transition-colors active:bg-accent",
        destructive ? "text-destructive" : "text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {icon ? (
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center [&_svg]:size-5",
            destructive ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex-1 truncate">{label}</span>
      {sublabel ? (
        <span className="shrink-0 text-muted-foreground text-sm">
          {sublabel}
        </span>
      ) : null}
      {trailing}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </div>
  );
}

function CheckTrailing({ checked }: { checked: boolean }) {
  if (!checked) {
    return null;
  }
  return <IconCheck className="size-5 shrink-0 text-muted-foreground" />;
}

type Screen = "root" | "turn-into";

interface MobileBlockActionsDrawerContentProps {
  onClose: () => void;
}

export function MobileBlockActionsDrawerContent({
  onClose,
}: MobileBlockActionsDrawerContentProps) {
  const {
    blockTypeLabel,
    canTurnInto,
    handleAddColumn,
    handleAddRow,
    handleDelete,
    handleDuplicate,
    handleFitToWidth,
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    handleTurnInto,
    handleViewToggle,
    lastTableRowId,
    resolvedViewChecks,
    tableBlock,
    turnIntoItems,
    turnIntoValue,
    viewOptions,
  } = useBlockGutterMenu();
  const [screen, setScreen] = useState<Screen>("root");

  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  if (screen === "turn-into") {
    return (
      <div className="flex min-h-0 flex-col overflow-y-auto px-2 pb-2">
        <div className="flex items-center gap-1 px-1 py-2">
          <button
            aria-label="Back"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground active:bg-accent"
            onClick={() => setScreen("root")}
            type="button"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <DrawerTitle>Turn into</DrawerTitle>
        </div>
        {turnIntoItems.map((item) => {
          const Icon = item.icon;
          return (
            <DrawerRow
              icon={<Icon />}
              key={item.key}
              label={item.label}
              onClick={() => runAndClose(() => handleTurnInto(item.key))}
              trailing={<CheckTrailing checked={item.key === turnIntoValue} />}
            />
          );
        })}
      </div>
    );
  }

  const tableProps = tableBlock?.props;

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto px-2 pt-1 pb-2">
      <DrawerTitle className="px-3 py-2">
        {blockTypeLabel ?? "Actions"}
      </DrawerTitle>

      {canTurnInto ? (
        <DrawerRow
          icon={<IconExchange />}
          label="Turn into"
          onClick={() => setScreen("turn-into")}
          sublabel={blockTypeLabel}
          trailing={
            <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
          }
        />
      ) : null}

      {viewOptions ? (
        <>
          <SectionLabel>{viewOptions.label}</SectionLabel>
          {viewOptions.items.map((item) => {
            const checked = resolvedViewChecks[item.id] ?? item.checked;
            return (
              <DrawerRow
                key={item.id}
                label={item.label}
                onClick={() => handleViewToggle(item.id, !checked)}
                trailing={<CheckTrailing checked={checked} />}
              />
            );
          })}
        </>
      ) : null}

      {tableBlock ? (
        <>
          <SectionLabel>Table</SectionLabel>
          <DrawerRow
            icon={<IconArrowsHorizontal />}
            label="Fit to width"
            onClick={() => runAndClose(handleFitToWidth)}
          />
          <DrawerRow
            icon={<IconTableRow />}
            label="Header row"
            onClick={() => handleToggleHeaderRow(!tableProps?.hasHeaderRow)}
            trailing={
              <CheckTrailing checked={Boolean(tableProps?.hasHeaderRow)} />
            }
          />
          <DrawerRow
            icon={<IconTableColumn />}
            label="Header column"
            onClick={() =>
              handleToggleHeaderColumn(!tableProps?.hasHeaderColumn)
            }
            trailing={
              <CheckTrailing checked={Boolean(tableProps?.hasHeaderColumn)} />
            }
          />
          {lastTableRowId ? (
            <>
              <DrawerRow
                icon={<IconRowInsertBottom />}
                label="Add row"
                onClick={() => runAndClose(handleAddRow)}
              />
              <DrawerRow
                icon={<IconColumnInsertRight />}
                label="Add column"
                onClick={() => runAndClose(handleAddColumn)}
              />
            </>
          ) : null}
        </>
      ) : null}

      <div className="my-1 h-px bg-border" />

      <DrawerRow
        icon={<IconCopy />}
        label="Duplicate"
        onClick={() => runAndClose(handleDuplicate)}
      />
      <DrawerRow
        destructive
        icon={<IconTrash />}
        label="Delete"
        onClick={() => runAndClose(handleDelete)}
      />
    </div>
  );
}
