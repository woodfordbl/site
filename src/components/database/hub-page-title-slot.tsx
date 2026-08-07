import { IconDatabase } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef, useState } from "react";

import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button } from "@/components/ui/button.tsx";
import { setDatabaseIcon } from "@/db/queries/database-collection-ops.ts";
import {
  renameDatabase,
  setDatabaseName,
} from "@/db/queries/database-page-ops.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { navigateAfterDatabaseHubRename } from "@/lib/databases/navigate-after-database-rename.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconButtonClassName,
  pageTitleIconPickerClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import { ensurePageIconPickerReady } from "@/lib/pages/preload-page-icon-picker.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

interface HubPageTitleSlotProps {
  database: LocalDatabase;
  pageId: string;
}

/**
 * Page-title chrome for database hubs: icon + name write through to the
 * database entity (`setDatabaseIcon` / {@link setDatabaseName} while typing,
 * {@link renameDatabase} on blur for the slug cascade), which mirrors onto hub
 * page metadata. Matches {@link PageTitleEditor} layout.
 */
export function HubPageTitleSlot({
  database,
  pageId: _pageId,
}: HubPageTitleSlotProps): ReactNode {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  const handleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle);
      if (nextTitle.trim() === "") {
        return;
      }
      setDatabaseName(database.id, nextTitle);
    },
    [database.id]
  );

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    const resolvedTitle =
      title.trim() === "" ? DEFAULT_PAGE_TITLE : title.trim();
    if (title.trim() === "") {
      setTitle(DEFAULT_PAGE_TITLE);
    }
    const change = renameDatabase(database.id, resolvedTitle);
    navigateAfterDatabaseHubRename(navigate, change);
  }, [database.id, navigate, title]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  const iconDisplay = database.icon ? (
    <PageIconDisplay icon={database.icon} />
  ) : (
    <IconDatabase className="shrink-0 stroke-[1.5px] text-muted-foreground" />
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
