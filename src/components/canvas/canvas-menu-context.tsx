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
  CanvasMenuPayload,
  SlashMenuSession,
} from "@/components/canvas/canvas-menu-types.ts";

/**
 * Slash menu open/payload state. Block actions use {@link BlockActionsMenuProvider}
 * with per-gutter compound menus instead of this context.
 */
interface CanvasMenuContextValue {
  closeMenu: () => void;
  open: boolean;
  openSlashMenu: (session: SlashMenuSession) => void;
  payload: CanvasMenuPayload | null;
  setSlashSession: (session: SlashMenuSession) => void;
}

interface CanvasSlashSessionContextValue {
  slashAnchorRef: React.RefObject<HTMLElement | null>;
  slashSession: SlashMenuSession | null;
}

const CanvasMenuContext = createContext<CanvasMenuContextValue | null>(null);

const CanvasSlashSessionContext =
  createContext<CanvasSlashSessionContextValue | null>(null);

export function CanvasMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const slashAnchorRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<CanvasMenuPayload | null>(null);
  const [slashSession, setSlashSessionState] =
    useState<SlashMenuSession | null>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPayload(null);
    setSlashSessionState(null);
    slashAnchorRef.current = null;
  }, []);

  const openSlashMenu = useCallback((session: SlashMenuSession) => {
    setSlashSessionState(session);
    slashAnchorRef.current = session.anchorElement;
    setPayload({ kind: "slash", rowId: session.rowId });
    setOpen(true);
  }, []);

  const setSlashSession = useCallback((session: SlashMenuSession) => {
    setSlashSessionState(session);
    slashAnchorRef.current = session.anchorElement;
  }, []);

  const value = useMemo(
    () => ({
      open,
      payload,
      closeMenu,
      openSlashMenu,
      setSlashSession,
    }),
    [open, payload, closeMenu, openSlashMenu, setSlashSession]
  );

  const slashValue = useMemo(
    () => ({ slashAnchorRef, slashSession }),
    [slashSession]
  );

  return (
    <CanvasMenuContext.Provider value={value}>
      <CanvasSlashSessionContext.Provider value={slashValue}>
        {children}
      </CanvasSlashSessionContext.Provider>
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

export function useCanvasSlashSession(): CanvasSlashSessionContextValue {
  const context = useContext(CanvasSlashSessionContext);
  if (!context) {
    throw new Error(
      "useCanvasSlashSession must be used within CanvasMenuProvider"
    );
  }
  return context;
}

export function canvasSlashTriggerId(rowId: string): string {
  return `canvas-slash-${rowId}`;
}
