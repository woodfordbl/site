import { useCallback, useMemo, useRef } from "react";
import type { SlashMenuItem } from "@/components/blocks/registry.ts";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import {
  canvasSlashTriggerId,
  useCanvasMenu,
} from "@/components/canvas/canvas-menu-context.tsx";
import type { SlashMenuSession } from "@/components/canvas/canvas-menu-types.ts";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useSlashState } from "@/hooks/use-slash-state.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import { buildRootSlashMenuItems } from "@/lib/canvas/slash-menu-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";

function findRowInSubtree(
  root: CanvasRow,
  rowId: string
): CanvasRow | undefined {
  if (root.rowId === rowId) {
    return root;
  }

  for (const child of root.children) {
    const found = findRowInSubtree(child, rowId);
    if (found) {
      return found;
    }
  }

  return;
}

export function useCanvasSlashMenu(row: CanvasRow, pages: PageSummary[]) {
  const { currentPageId, dispatch } = useCanvasEditorContext();
  const dispatchPage = usePageDispatch(pages);
  const {
    open: menuOpen,
    payload,
    closeMenu,
    openSlashMenu,
    setSlashSession,
    notifySlashUpdate,
  } = useCanvasMenu();
  const slashFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null
  );
  const convertRowIdRef = useRef<string | undefined>(undefined);
  const slashSuppressedRef = useRef(false);
  const programmaticSlashCloseRef = useRef(false);
  // The slash session (and its `onClose`) is captured when the menu opens, at
  // which point `payload` is still null for this row. Read the latest payload
  // from a ref so the close guard isn't frozen by that stale closure.
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

  const slashMenuOpen =
    menuOpen && payload?.kind === "slash" && payload.rowId === row.rowId;

  const rootItems = useMemo(
    () => buildRootSlashMenuItems(slashQuery, currentPageId, pages),
    [slashQuery, currentPageId, pages]
  );
  const slashItemCount = rootItems.length;
  const slashTriggerId = canvasSlashTriggerId(row.rowId);

  const resolveConvertRow = useCallback(() => {
    const convertRowId = convertRowIdRef.current;
    if (!convertRowId) {
      return row;
    }

    return findRowInSubtree(row, convertRowId) ?? row;
  }, [row]);

  const closeSlashMenuInternal = useCallback(() => {
    const currentPayload = payloadRef.current;
    const willClose =
      currentPayload?.kind === "slash" && currentPayload.rowId === row.rowId;
    if (willClose) {
      closeMenu();
    }
    convertRowIdRef.current = undefined;
    closeSlash();
  }, [closeMenu, closeSlash, row.rowId]);

  const closeSlashMenu = useCallback(() => {
    programmaticSlashCloseRef.current = true;
    slashSuppressedRef.current = false;
    closeSlashMenuInternal();
  }, [closeSlashMenuInternal]);

  // Close the popover before mutating the block: the conversion unmounts the
  // anchored editor field, so deferring the dispatch lets the popover unmount
  // first instead of repositioning against a dead anchor (jumping to 0,0).
  const handleBlockSlashSelect = useCallback(
    (item: SlashMenuItem) => {
      const targetRow = resolveConvertRow();
      closeSlashMenu();
      queueMicrotask(() => {
        applyBlockConversion(targetRow, item, dispatch);
        if (item.id !== "list" && item.id !== "checklist") {
          dispatch({
            type: "focus.set",
            rowId: targetRow.rowId,
            placement: "start",
          });
        }
      });
    },
    [closeSlashMenu, dispatch, resolveConvertRow]
  );

  const handlePageLinkSelect = useCallback(
    (pageId: string) => {
      const targetRow = resolveConvertRow();
      closeSlashMenu();
      queueMicrotask(() => {
        dispatch({
          type: "slash.convert",
          rowId: targetRow.rowId,
          to: "pageLink",
          pageId,
        });
        dispatch({
          type: "focus.set",
          rowId: targetRow.rowId,
          placement: "start",
        });
      });
    },
    [closeSlashMenu, dispatch, resolveConvertRow]
  );

  const handlePageCreate = useCallback(() => {
    const pageId = crypto.randomUUID();
    const targetRow = resolveConvertRow();
    closeSlashMenu();
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
      });
    });
  }, [
    closeSlashMenu,
    currentPageId,
    dispatch,
    dispatchPage,
    resolveConvertRow,
  ]);

  const dismissSlashMenu = useCallback(() => {
    programmaticSlashCloseRef.current = true;
    slashSuppressedRef.current = true;
    closeSlashMenuInternal();
  }, [closeSlashMenuInternal]);

  const handleSlashPopoverOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        return;
      }
      if (programmaticSlashCloseRef.current) {
        programmaticSlashCloseRef.current = false;
        return;
      }
      dismissSlashMenu();
    },
    [dismissSlashMenu]
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
      notifySlashUpdate();
    },
    [notifySlashUpdate, setSlashSession, slashMenuOpen]
  );

  const handleExitLinkPhase = useCallback(() => {
    setSlashPhase("root");
    setLinkSubOpen(false);
    slashFieldRef.current?.focus();
    publishSlashSession({ slashPhase: "root", linkSubOpen: false });
  }, [publishSlashSession, setLinkSubOpen, setSlashPhase]);

  const handleLinkSubOpenChange = useCallback(
    (open: boolean) => {
      setLinkSubOpen(open);
      setSlashPhase(open ? "link" : "root");
      if (!open) {
        slashFieldRef.current?.focus();
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

  const confirmSlashSelection = useCallback(() => {
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
    rowId: row.rowId,
    convertRowId: convertRowIdRef.current,
    triggerId: slashTriggerId,
    anchorElement: slashFieldRef.current,
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
    confirmSelection: confirmSlashSelection,
    onClose: closeSlashMenu,
    onDismiss: dismissSlashMenu,
    onPopoverOpenChange: handleSlashPopoverOpenChange,
    onLinkSubOpenChange: handleLinkSubOpenChange,
    onExitLinkPhase: handleExitLinkPhase,
    ...overrides,
  });

  const navigateSlashSelection = useCallback(
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

  const handleSlashInput = useCallback(
    (query: string, caret: FieldSelection, convertRowId?: string) => {
      if (slashSuppressedRef.current) {
        return;
      }
      convertRowIdRef.current = convertRowId;
      handleSlash(query, caret);
      const session = buildSlashSessionRef.current({
        query,
        slashCaret: caret,
        slashPhase: "root",
        linkSubOpen: false,
        convertRowId,
      });

      if (!slashMenuOpen) {
        openSlashMenu(session);
        return;
      }

      setSlashSession(session);
      notifySlashUpdate();
    },
    [
      handleSlash,
      notifySlashUpdate,
      openSlashMenu,
      setSlashSession,
      slashMenuOpen,
    ]
  );

  return {
    closeSlashMenu,
    confirmSlashSelection,
    dismissSlashMenu,
    handleExitLinkPhase,
    handleSlashInput,
    navigateSlashSelection,
    slashCaret,
    slashFieldRef,
    slashMenuOpen,
    slashPhase,
  };
}
