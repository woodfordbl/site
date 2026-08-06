import { IconDatabase } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useRef, useState } from "react";

import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button } from "@/components/ui/button.tsx";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { setDatabaseIcon } from "@/db/queries/database-collection-ops.ts";
import { renameDatabase } from "@/db/queries/database-page-ops.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconButtonClassName,
  pageTitleIconPickerClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import { ensurePageIconPickerReady } from "@/lib/pages/preload-page-icon-picker.ts";
import { syncPageUrl } from "@/lib/pages/sync-url.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

interface HubPageTitleSlotProps {
  database: LocalDatabase;
  pageId: string;
}

/**
 * Page-title chrome for database hubs: icon + name write through to the
 * database entity (`setDatabaseIcon` / `renameDatabase`), which mirrors onto
 * the hub page metadata. Matches {@link PageTitleEditor} layout.
 */
export function HubPageTitleSlot({
  database,
  pageId,
}: HubPageTitleSlotProps): ReactNode {
  const queryClient = useQueryClient();
  const persistedName = database.name;
  const [title, setTitle] = useState(persistedName);
  const [prevPersistedName, setPrevPersistedName] = useState(persistedName);
  const isEditingRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const iconTriggerRef = useRef<HTMLButtonElement>(null);

  if (!isEditingRef.current && persistedName !== prevPersistedName) {
    setPrevPersistedName(persistedName);
    setTitle(persistedName);
  }

  const handleChange = useCallback((nextTitle: string) => {
    setTitle(nextTitle);
  }, []);

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    const resolvedTitle =
      title.trim() === "" ? DEFAULT_PAGE_TITLE : title.trim();
    if (title.trim() === "") {
      setTitle(DEFAULT_PAGE_TITLE);
    }
    if (resolvedTitle === database.name) {
      return;
    }
    renameDatabase(database.id, resolvedTitle);
    const hub = localPagesCollection.get(pageId);
    if (hub && typeof window !== "undefined") {
      // Preserve the current route family (`/$` vs `/p/$`) — hub URLs follow
      // the host page's routeBy, not the hub document's.
      syncPageUrl(hub.slug, {
        userPage: window.location.pathname.startsWith("/p/"),
      });
    }
  }, [database.id, database.name, pageId, title]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  const iconDisplay = database.icon ? (
    <PageIconDisplay icon={database.icon} />
  ) : (
    <IconDatabase className="size-[1.2em] shrink-0 stroke-[1.5px] text-muted-foreground" />
  );

  return (
    <div className={pageTitleEditorLayoutClassName}>
      <div className={pageTitleIconSlotClassName}>
        <Button
          aria-label="Change database icon"
          className={cn(
            pageTitleIconButtonClassName,
            pageTitleIconPickerClassName,
            "text-muted-foreground"
          )}
          onClick={() => {
            setPickerOpen(true);
          }}
          onPointerEnter={() => {
            ensurePageIconPickerReady(queryClient);
          }}
          ref={iconTriggerRef}
          size="icon"
          type="button"
          variant="ghost"
        >
          {iconDisplay}
        </Button>
        <GlyphIconPicker
          anchor={iconTriggerRef}
          ariaLabel="Change database icon"
          hideTrigger
          icon={database.icon}
          onOpenChange={setPickerOpen}
          onRemove={() => {
            setDatabaseIcon(database.id, undefined);
          }}
          onSelect={(nextIcon) => {
            setDatabaseIcon(database.id, nextIcon);
          }}
          open={pickerOpen}
        />
      </div>
      <EditableSurface
        ariaLabel="Database title"
        className={cn(
          "w-full min-w-0",
          "h-auto",
          headingSurfaceClassName,
          headingTypographyClassNames[1]
        )}
        onChange={handleChange}
        onTextBlur={handleBlur}
        onTextFocus={handleFocus}
        placeholder={DEFAULT_PAGE_TITLE}
        value={title}
      />
    </div>
  );
}
