import {
  IconCopy,
  IconExternalLink,
  IconPhoto,
  IconStar,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useState,
} from "react";

import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { localDatabaseRowsCollection } from "@/db/collections/local-collections.ts";
import {
  deleteDatabaseRows,
  duplicateDatabaseRows,
} from "@/db/queries/database-collection-ops.ts";
import { useDatabase } from "@/db/queries/use-database.ts";
import { useFavoriteActions, useIsFavorite } from "@/hooks/use-favorites.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  ensureDatabaseRowPage,
  resolveDatabaseRowPageTitle,
} from "@/lib/databases/materialize-row-page.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

interface DatabaseRowIconSession {
  pageId: string;
  title: string;
}

interface DatabaseRowMenuProps {
  children: ReactNode;
  /**
   * Row that received the right-click (anchor for Open / Change icon /
   * favorites). Multi-select actions use `selectedRowIds`.
   */
  contextRow: LocalDatabaseRow;
  databaseId: string;
  mode: "view" | "edit";
  /**
   * Called when the menu is about to open so the grid can update selection
   * (solo-select if the context row was not already selected).
   */
  onBeforeOpen: (rowId: string) => void;
  onSelectionCleared?: () => void;
  /** Anchor element for the change-icon picker (usually the row DOM node). */
  rowAnchorRef: RefObject<HTMLElement | null>;
  selectedRowIds: readonly string[];
}

/**
 * Right-click menu for a database table row. Opens the shared Base UI
 * context menu; favorites / change-icon materialize a row page when needed
 * (without navigating away — `navigate: false`).
 */
export function DatabaseRowMenu({
  children,
  contextRow,
  databaseId,
  mode,
  onBeforeOpen,
  onSelectionCleared,
  rowAnchorRef,
  selectedRowIds,
}: DatabaseRowMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [iconSession, setIconSession] = useState<DatabaseRowIconSession | null>(
    null
  );
  const navigate = useNavigate();
  const database = useDatabase(databaseId);
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const { toggleFavorite } = useFavoriteActions();

  // Prefer the linked page when present so favorites/icon state track reality.
  const favoritePageId = contextRow.pageId ?? null;
  const isFavorite = useIsFavorite(favoritePageId ?? "");

  const actionRowIds = useMemo(() => {
    if (selectedRowIds.includes(contextRow.id)) {
      return selectedRowIds;
    }
    return [contextRow.id];
  }, [contextRow.id, selectedRowIds]);

  const selectionCount = actionRowIds.length;
  const isSyncedContext = contextRow.externalId !== undefined;

  const canMutateRows = useMemo(
    () =>
      actionRowIds.some((rowId) => {
        const row = localDatabaseRowsCollection.get(rowId);
        return row !== undefined && row.externalId === undefined;
      }),
    [actionRowIds]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        onBeforeOpen(contextRow.id);
      }
      setOpen(next);
    },
    [contextRow.id, onBeforeOpen]
  );

  const handleOpen = useCallback(() => {
    navigate({
      params: { databaseId, rowId: contextRow.id },
      to: "/db/$databaseId/$rowId",
    });
  }, [contextRow.id, databaseId, navigate]);

  const ensureContextPage = useCallback(
    (withNavigation: boolean): Promise<string | null> => {
      if (!database) {
        return Promise.resolve(null);
      }
      return ensureDatabaseRowPage({
        database,
        dispatch,
        navigate: withNavigation,
        pages,
        row: contextRow,
      });
    },
    [contextRow, database, dispatch, pages]
  );

  const handleToggleFavorite = useCallback(() => {
    if (isSyncedContext) {
      return;
    }
    ensureContextPage(false)
      .then((pageId) => {
        if (pageId) {
          toggleFavorite(pageId);
        }
      })
      .catch(() => undefined);
  }, [ensureContextPage, isSyncedContext, toggleFavorite]);

  const handleChangeIcon = useCallback(() => {
    if (isSyncedContext || !database) {
      return;
    }
    ensureContextPage(false)
      .then((pageId) => {
        if (!pageId) {
          return;
        }
        setIconSession({
          pageId,
          title: resolveDatabaseRowPageTitle(database, contextRow),
        });
      })
      .catch(() => undefined);
  }, [contextRow, database, ensureContextPage, isSyncedContext]);

  const handleDuplicate = useCallback(() => {
    if (mode !== "edit") {
      return;
    }
    duplicateDatabaseRows([...actionRowIds]);
    onSelectionCleared?.();
  }, [actionRowIds, mode, onSelectionCleared]);

  const handleDelete = useCallback(() => {
    if (mode !== "edit") {
      return;
    }
    deleteDatabaseRows([...actionRowIds]);
    onSelectionCleared?.();
  }, [actionRowIds, mode, onSelectionCleared]);

  // Keep favorite label reactive when materialize just linked a pageId.
  const favoriteLabel = isFavorite
    ? "Remove from favorites"
    : "Add to favorites";

  const linkedPage = iconSession
    ? pages.find((page) => page.id === iconSession.pageId)
    : undefined;

  return (
    <>
      <ContextMenu onOpenChange={handleOpenChange} open={open}>
        <ContextMenuTrigger render={children as never} />
        <ContextMenuContent className="w-56">
          <ContextMenuGroup>
            <ContextMenuLabel>
              {selectionCount > 1 ? `${selectionCount} rows` : "Row"}
            </ContextMenuLabel>
            {selectionCount === 1 ? (
              <ContextMenuItem onClick={handleOpen}>
                <IconExternalLink />
                Open
              </ContextMenuItem>
            ) : null}
            {selectionCount === 1 ? (
              <ContextMenuItem
                disabled={isSyncedContext}
                onClick={handleChangeIcon}
              >
                <IconPhoto />
                Change icon
              </ContextMenuItem>
            ) : null}
            {selectionCount === 1 ? (
              <ContextMenuItem
                disabled={isSyncedContext}
                onClick={handleToggleFavorite}
              >
                {isFavorite ? <IconStarOff /> : <IconStar />}
                {favoriteLabel}
              </ContextMenuItem>
            ) : null}
            {mode === "edit" ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={!canMutateRows}
                  onClick={handleDuplicate}
                >
                  <IconCopy />
                  {selectionCount > 1
                    ? `Duplicate ${selectionCount} rows`
                    : "Duplicate"}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!canMutateRows}
                  onClick={handleDelete}
                  variant="destructive"
                >
                  <IconTrash />
                  {selectionCount > 1
                    ? `Delete ${selectionCount} rows`
                    : "Delete"}
                </ContextMenuItem>
              </>
            ) : null}
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      {iconSession ? (
        <PageIconPicker
          anchor={rowAnchorRef}
          contentAlign="start"
          contentSide="bottom"
          hideTrigger
          icon={linkedPage?.icon}
          onOpenChange={(next) => {
            if (!next) {
              setIconSession(null);
            }
          }}
          open
          pageId={iconSession.pageId}
          pages={pages}
          title={iconSession.title}
        />
      ) : null}
    </>
  );
}
