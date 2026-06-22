"use client";

import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";

interface BlockActionsMenuContextValue {
  closeBlockActionsMenu: () => void;
  openRowId: string | null;
  setOpenRowId: (rowId: string | null) => void;
}

const BlockActionsMenuContext =
  createContext<BlockActionsMenuContextValue | null>(null);

export function useBlockActionsMenu(): BlockActionsMenuContextValue {
  const context = useContext(BlockActionsMenuContext);
  if (!context) {
    throw new Error(
      "useBlockActionsMenu must be used within BlockActionsMenuProvider."
    );
  }
  return context;
}

export function BlockActionsMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const closeBlockActionsMenu = useCallback(() => setOpenRowId(null), []);

  const value = useMemo(
    () => ({
      openRowId,
      setOpenRowId,
      closeBlockActionsMenu,
    }),
    [closeBlockActionsMenu, openRowId]
  );

  return (
    <BlockActionsMenuContext.Provider value={value}>
      {children}
    </BlockActionsMenuContext.Provider>
  );
}

export function useCloseBlockActionsMenuBeforeAction() {
  const { closeBlockActionsMenu, openRowId } = useBlockActionsMenu();

  return useCallback(
    (action: () => void) => {
      if (openRowId) {
        closeBlockActionsMenu();
        queueMicrotask(action);
        return;
      }
      action();
    },
    [closeBlockActionsMenu, openRowId]
  );
}

function BlockActionsMenu({
  rowId,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu> & { rowId: string }) {
  const { openRowId, setOpenRowId } = useBlockActionsMenu();

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => setOpenRowId(open ? rowId : null)}
      open={openRowId === rowId}
      {...props}
    >
      {children}
    </DropdownMenu>
  );
}

function BlockActionsMenuTrigger({
  ...props
}: ComponentProps<typeof DropdownMenuTrigger>) {
  return <DropdownMenuTrigger nativeButton {...props} />;
}

function BlockActionsMenuContent({
  align = "center",
  className,
  side = "left",
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      align={align}
      className={cn(
        "min-w-64 duration-0 data-closed:animate-none data-closed:duration-0",
        className
      )}
      data-canvas-row-menu
      finalFocus={false}
      side={side}
      {...props}
    />
  );
}

export { BlockActionsMenu, BlockActionsMenuContent, BlockActionsMenuTrigger };
