"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  BlockActionsSession,
  CanvasMenuPayload,
  SlashMenuSession,
} from "@/components/canvas/canvas-menu-types.ts";
import {
  createDropdownMenuHandle,
  type DropdownMenuHandle,
} from "@/components/ui/dropdown-menu.tsx";

interface CanvasMenuContextValue {
  blockActionsSession: BlockActionsSession | null;
  closeMenu: () => void;
  handle: DropdownMenuHandle<CanvasMenuPayload>;
  notifySlashUpdate: () => void;
  open: boolean;
  openBlockActions: (session: BlockActionsSession) => void;
  openSlashMenu: (session: SlashMenuSession) => void;
  payload: CanvasMenuPayload | null;
  setSlashSession: (session: SlashMenuSession) => void;
  slashAnchorRef: React.RefObject<HTMLElement | null>;
  slashSession: SlashMenuSession | null;
  slashUpdateVersion: number;
  triggerId: string | null;
}

const CanvasMenuContext = createContext<CanvasMenuContextValue | null>(null);

export function CanvasMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const handle = useMemo(
    () => createDropdownMenuHandle<CanvasMenuPayload>(),
    []
  );
  const slashAnchorRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const [payload, setPayload] = useState<CanvasMenuPayload | null>(null);
  const [blockActionsSession, setBlockActionsSession] =
    useState<BlockActionsSession | null>(null);
  const [slashSession, setSlashSessionState] =
    useState<SlashMenuSession | null>(null);
  const [slashUpdateVersion, setSlashUpdateVersion] = useState(0);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setTriggerId(null);
    setPayload(null);
    setBlockActionsSession(null);
    setSlashSessionState(null);
    slashAnchorRef.current = null;
  }, []);

  const openBlockActions = useCallback((session: BlockActionsSession) => {
    setBlockActionsSession(session);
    setSlashSessionState(null);
    slashAnchorRef.current = null;
    setTriggerId(session.triggerId);
    setPayload({ kind: "block-actions", rowId: session.rowId });
    setOpen(true);
  }, []);

  const openSlashMenu = useCallback((session: SlashMenuSession) => {
    setSlashSessionState(session);
    setBlockActionsSession(null);
    slashAnchorRef.current = session.anchorElement;
    setTriggerId(session.triggerId);
    setPayload({ kind: "slash", rowId: session.rowId });
    setOpen(true);
  }, []);

  const setSlashSession = useCallback((session: SlashMenuSession) => {
    setSlashSessionState(session);
    slashAnchorRef.current = session.anchorElement;
  }, []);

  const notifySlashUpdate = useCallback(() => {
    setSlashUpdateVersion((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({
      handle,
      open,
      triggerId,
      payload,
      blockActionsSession,
      slashSession,
      slashAnchorRef,
      slashUpdateVersion,
      closeMenu,
      openBlockActions,
      openSlashMenu,
      setSlashSession,
      notifySlashUpdate,
    }),
    [
      handle,
      open,
      triggerId,
      payload,
      blockActionsSession,
      slashSession,
      slashUpdateVersion,
      closeMenu,
      openBlockActions,
      openSlashMenu,
      setSlashSession,
      notifySlashUpdate,
    ]
  );

  return (
    <CanvasMenuContext.Provider value={value}>
      {children}
    </CanvasMenuContext.Provider>
  );
}

export function useCanvasMenu(): CanvasMenuContextValue {
  const context = useContext(CanvasMenuContext);
  if (!context) {
    throw new Error("useCanvasMenu must be used within CanvasMenuProvider");
  }
  return context;
}

export function canvasBlockActionsTriggerId(rowId: string): string {
  return `canvas-block-actions-${rowId}`;
}

export function useCloseBlockActionsMenuBeforeAction() {
  const { closeMenu, open, payload } = useCanvasMenu();

  return useCallback(
    (action: () => void) => {
      if (open && payload?.kind === "block-actions") {
        closeMenu();
        queueMicrotask(action);
        return;
      }
      action();
    },
    [closeMenu, open, payload]
  );
}

export function canvasSlashTriggerId(rowId: string): string {
  return `canvas-slash-${rowId}`;
}
