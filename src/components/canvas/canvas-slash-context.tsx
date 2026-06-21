"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

import type { SlashMenuItem } from "@/components/blocks/registry.ts";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import {
  canvasSlashTriggerId,
  useCanvasMenu,
} from "@/components/canvas/canvas-menu-context.tsx";
import type { SlashMenuSession } from "@/components/canvas/canvas-menu-types.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { type SlashPhase, useSlashState } from "@/hooks/use-slash-state.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import { buildRootSlashMenuItems } from "@/lib/canvas/slash-menu-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";

/**
 * One slash-menu controller per canvas (only one menu can be open), keyed by
 * the row the user is typing in. Rows wire up via {@link useRowSlash} instead
 * of threading a dozen callbacks through every container layer.
 * @see docs/architecture/canvas-editor.md#slash-menu
 */
export interface CanvasSlashActions {
  close: () => void;
  confirm: () => void;
  dismiss: () => void;
  exitLinkPhase: () => void;
  input: (rowId: string, query: string, caret: FieldSelection) => void;
  navigate: (direction: "up" | "down") => void;
}

interface CanvasSlashState {
  activeRowId: string | null;
  caret: FieldSelection;
  phase: SlashPhase;
}

const CanvasSlashActionsContext = createContext<CanvasSlashActions | null>(
  null
);
const CanvasSlashStateContext = createContext<CanvasSlashState | null>(null);

function resolveAnchorField(): (HTMLInputElement | HTMLTextAreaElement) | null {
  const active = document.activeElement;
  return active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
    ? active
    : null;
}

export function CanvasSlashProvider({
  children,
  pages,
}: {
  children: ReactNode;
  pages: PageSummary[];
}) {
  const { currentPageId, dispatch, getRows } = useCanvasEditorContext();
  const dispatchPage = usePageDispatch(pages);
  const {
    open: menuOpen,
    payload,
    closeMenu,
    openSlashMenu,
    setSlashSession,
  } = useCanvasMenu();

  const anchorFieldRef = useRef<HTMLElement | null>(null);
  const activeRowIdRef = useRef<string | null>(null);
  const slashSuppressedRef = useRef(false);
  const programmaticSlashCloseRef = useRef(false);
  // `payload` is captured when sessions are built; read the live value so
  // close guards are not frozen by stale closures.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const {
    slashQuery,
    slashCaret,
    selectedIndex,
    slashPhase,
    linkSubOpen,
    handleSlash,
    closeSlash,
    moveSelection,
    setSlashPhase,
    setLinkSubOpen,
  } = useSlashState();

  const slashMenuOpen = menuOpen && payload?.kind === "slash";
  const activeRowId = slashMenuOpen ? activeRowIdRef.current : null;

  const rootItems = useMemo(
    () => buildRootSlashMenuItems(slashQuery, currentPageId, pages),
    [slashQuery, currentPageId, pages]
  );
  const slashItemCount = rootItems.length;

  const resolveActiveRow = useCallback(() => {
    const rowId = activeRowIdRef.current;
    return rowId ? findRowById(getRows(), rowId) : undefined;
  }, [getRows]);

  const closeSlashMenuInternal = useCallback(() => {
    if (payloadRef.current?.kind === "slash") {
      closeMenu();
    }
    activeRowIdRef.current = null;
    anchorFieldRef.current = null;
    closeSlash();
  }, [closeMenu, closeSlash]);

  const close = useCallback(() => {
    programmaticSlashCloseRef.current = true;
    slashSuppressedRef.current = false;
    closeSlashMenuInternal();
  }, [closeSlashMenuInternal]);

  const dismiss = useCallback(() => {
    programmaticSlashCloseRef.current = true;
    slashSuppressedRef.current = true;
    closeSlashMenuInternal();
  }, [closeSlashMenuInternal]);

  // Close the popover before mutating the block: the conversion unmounts the
  // anchored editor field, so deferring the dispatch lets the popover unmount
  // first instead of repositioning against a dead anchor (jumping to 0,0).
  const handleBlockSlashSelect = useCallback(
    (item: SlashMenuItem) => {
      const targetRow = resolveActiveRow();
      close();
      if (!targetRow) {
        return;
      }
      queueMicrotask(() => {
        applyBlockConversion(targetRow, item, dispatch);
        if (
          item.id !== "list" &&
          item.id !== "checklist" &&
          item.id !== "columns"
        ) {
          dispatch({
            type: "focus.set",
            rowId: targetRow.rowId,
            placement: "start",
          });
        }
      });
    },
    [close, dispatch, resolveActiveRow]
  );

  const handlePageLinkSelect = useCallback(
    (pageId: string) => {
      const targetRow = resolveActiveRow();
      close();
      if (!targetRow) {
        return;
      }
      queueMicrotask(() => {
        dispatch({
          type: "slash.convert",
          rowId: targetRow.rowId,
          to: "pageLink",
          pageId,
          pageLinkVariant: "linked",
        });
        dispatch({
          type: "focus.set",
          rowId: targetRow.rowId,
          placement: "start",
        });
      });
    },
    [close, dispatch, resolveActiveRow]
  );

  const handlePageCreate = useCallback(() => {
    const pageId = crypto.randomUUID();
    const targetRow = resolveActiveRow();
    close();
    if (!targetRow) {
      return;
    }
    queueMicrotask(() => {
      dispatchPage({
        type: "page.create",
        parentId: currentPageId,
        pageId,
        navigate: false,
        title: DEFAULT_PAGE_TITLE,
      });
      dispatch({
        type: "slash.convert",
        rowId: targetRow.rowId,
        to: "pageLink",
        pageId,
        pageLinkVariant: "child",
      });
    });
  }, [close, currentPageId, dispatch, dispatchPage, resolveActiveRow]);

  const handleSlashPopoverOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        return;
      }
      if (programmaticSlashCloseRef.current) {
        programmaticSlashCloseRef.current = false;
        return;
      }
      dismiss();
    },
    [dismiss]
  );

  const buildSlashSessionRef = useRef<
    (overrides?: Partial<SlashMenuSession>) => SlashMenuSession
  >(() => {
    throw new Error("buildSlashSessionRef is not initialized");
  });

  const publishSlashSession = useCallback(
    (overrides: Partial<SlashMenuSession> = {}) => {
      if (!slashMenuOpen) {
        return;
      }
      setSlashSession(buildSlashSessionRef.current(overrides));
    },
    [setSlashSession, slashMenuOpen]
  );

  const exitLinkPhase = useCallback(() => {
    setSlashPhase("root");
    setLinkSubOpen(false);
    anchorFieldRef.current?.focus();
    publishSlashSession({ slashPhase: "root", linkSubOpen: false });
  }, [publishSlashSession, setLinkSubOpen, setSlashPhase]);

  const handleLinkSubOpenChange = useCallback(
    (open: boolean) => {
      setLinkSubOpen(open);
      setSlashPhase(open ? "link" : "root");
      if (!open) {
        anchorFieldRef.current?.focus();
      }
      publishSlashSession({
        linkSubOpen: open,
        slashPhase: open ? "link" : "root",
      });
    },
    [publishSlashSession, setLinkSubOpen, setSlashPhase]
  );

  const enterLinkPhase = useCallback(() => {
    setSlashPhase("link");
    setLinkSubOpen(true);
    publishSlashSession({ slashPhase: "link", linkSubOpen: true });
  }, [publishSlashSession, setLinkSubOpen, setSlashPhase]);

  const confirm = useCallback(() => {
    const selected = rootItems[selectedIndex];
    if (!selected) {
      return;
    }

    switch (selected.kind) {
      case "block":
        handleBlockSlashSelect(selected.blockItem);
        return;
      case "page.create":
        handlePageCreate();
        return;
      case "page.link.trigger":
        enterLinkPhase();
        return;
      default: {
        const _exhaustive: never = selected;
        return _exhaustive;
      }
    }
  }, [
    enterLinkPhase,
    handleBlockSlashSelect,
    handlePageCreate,
    rootItems,
    selectedIndex,
  ]);

  buildSlashSessionRef.current = (
    overrides: Partial<SlashMenuSession> = {}
  ) => ({
    rowId: activeRowIdRef.current ?? "",
    triggerId: canvasSlashTriggerId(activeRowIdRef.current ?? ""),
    anchorElement: anchorFieldRef.current,
    query: slashQuery,
    selectedIndex,
    slashCaret,
    pages,
    currentPageId,
    slashPhase,
    linkSubOpen,
    onSelectBlock: handleBlockSlashSelect,
    onSelectPageCreate: handlePageCreate,
    onSelectPageLink: handlePageLinkSelect,
    confirmSelection: confirm,
    onClose: close,
    onDismiss: dismiss,
    onPopoverOpenChange: handleSlashPopoverOpenChange,
    onLinkSubOpenChange: handleLinkSubOpenChange,
    onExitLinkPhase: exitLinkPhase,
    ...overrides,
  });

  const navigate = useCallback(
    (direction: "up" | "down") => {
      if (slashPhase !== "root" || slashItemCount === 0) {
        return;
      }

      const nextIndex =
        direction === "down"
          ? Math.min(selectedIndex + 1, slashItemCount - 1)
          : Math.max(selectedIndex - 1, 0);

      if (nextIndex === selectedIndex) {
        return;
      }

      moveSelection(direction, slashItemCount);
      publishSlashSession({ selectedIndex: nextIndex });
    },
    [
      moveSelection,
      publishSlashSession,
      selectedIndex,
      slashItemCount,
      slashPhase,
    ]
  );

  const input = useCallback(
    (rowId: string, query: string, caret: FieldSelection) => {
      if (slashSuppressedRef.current) {
        return;
      }
      activeRowIdRef.current = rowId;
      anchorFieldRef.current = resolveAnchorField();
      handleSlash(query, caret);
      const session = buildSlashSessionRef.current({
        rowId,
        triggerId: canvasSlashTriggerId(rowId),
        anchorElement: anchorFieldRef.current,
        query,
        slashCaret: caret,
        slashPhase: "root",
        linkSubOpen: false,
      });

      if (slashMenuOpen) {
        setSlashSession(session);
        return;
      }

      openSlashMenu(session);
    },
    [handleSlash, openSlashMenu, setSlashSession, slashMenuOpen]
  );

  const actions = useMemo<CanvasSlashActions>(
    () => ({ close, confirm, dismiss, exitLinkPhase, input, navigate }),
    [close, confirm, dismiss, exitLinkPhase, input, navigate]
  );

  const state = useMemo<CanvasSlashState>(
    () => ({ activeRowId, caret: slashCaret, phase: slashPhase }),
    [activeRowId, slashCaret, slashPhase]
  );

  return (
    <CanvasSlashActionsContext.Provider value={actions}>
      <CanvasSlashStateContext.Provider value={state}>
        {children}
      </CanvasSlashStateContext.Provider>
    </CanvasSlashActionsContext.Provider>
  );
}

export interface RowSlashControls {
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  slashCaret?: FieldSelection;
  slashMenuOpen: boolean;
  slashPhase?: SlashPhase;
}

const INERT_ROW_SLASH: RowSlashControls = { slashMenuOpen: false };

/**
 * Slash wiring for one row. Inert when slash is disabled for the block type
 * or when no provider is mounted (server render).
 */
export function useRowSlash(rowId: string, enabled: boolean): RowSlashControls {
  const actions = useContext(CanvasSlashActionsContext);
  const state = useContext(CanvasSlashStateContext);

  const onSlash = useCallback(
    (query: string, caret: FieldSelection) => {
      actions?.input(rowId, query, caret);
    },
    [actions, rowId]
  );

  return useMemo(() => {
    if (!(enabled && actions)) {
      return INERT_ROW_SLASH;
    }

    const open = state?.activeRowId === rowId;
    return {
      onSlash,
      onSlashClose: actions.close,
      onSlashDismiss: actions.dismiss,
      onSlashLinkBack: actions.exitLinkPhase,
      onSlashMenuConfirm: actions.confirm,
      onSlashMenuNavigate: actions.navigate,
      slashCaret: open ? state?.caret : undefined,
      slashMenuOpen: open,
      slashPhase: open ? state?.phase : undefined,
    };
  }, [actions, enabled, onSlash, rowId, state]);
}
