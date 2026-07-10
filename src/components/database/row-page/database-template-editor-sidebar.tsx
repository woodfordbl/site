import { IconChevronLeft, IconEye, IconPencil } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/materialize-row-page.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** Rows offered in the preview picker — enough to sample, never the world. */
const PREVIEW_ROW_LIMIT = 12;

export interface DatabaseTemplateEditorSidebarProps {
  database: LocalDatabase;
  /** Row currently previewed, or null while editing. */
  previewRowId?: string | null;
  /** Preview rows (already capped by the route); empty hides the section. */
  previewRows?: LocalDatabaseRow[];
  setPreviewRowId?: (rowId: string | null) => void;
}

/**
 * Sidebar for the row-template editor: a way back to the database, a short
 * explainer, and the **Preview as row** picker — selecting a row swaps the
 * editor for a live preview of that row's page ({@link PREVIEW_ROW_LIMIT}
 * rows max, primary-field titles); "Editing template" returns.
 */
export function DatabaseTemplateEditorSidebar({
  database,
  previewRowId = null,
  previewRows = [],
  setPreviewRowId,
}: DatabaseTemplateEditorSidebarProps) {
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      data-side="left"
      data-sidebar="sidebar"
      data-state="expanded"
      id="page-sidebar"
    >
      <SidebarContent>
        <SidebarGroup className="gap-y-px">
          <SidebarMenu className="w-fit">
            <SidebarMenuItem className="w-fit">
              <SidebarMenuButton
                className="w-fit"
                render={
                  <Link
                    params={{ databaseId: database.id }}
                    to="/db/$databaseId"
                  />
                }
              >
                <IconChevronLeft />
                <span className="min-w-0 truncate">
                  Back to {database.name}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1 px-2 py-1.5 text-sidebar-foreground/60 text-sm">
              <p>Rows in {database.name} start from this template.</p>
              <p>
                Type <code className="font-mono text-xs">{"{{"}</code> to insert
                a property.
              </p>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
        {setPreviewRowId && previewRows.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Preview as row</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={previewRowId === null}
                    onClick={() => {
                      setPreviewRowId(null);
                    }}
                  >
                    <IconPencil />
                    <span>Editing template</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {previewRows.map((row) => (
                  <SidebarMenuItem key={row.id}>
                    <SidebarMenuButton
                      isActive={previewRowId === row.id}
                      onClick={() => {
                        setPreviewRowId(row.id);
                      }}
                    >
                      <IconEye />
                      <span className="min-w-0 truncate">
                        {resolveDatabaseRowPageTitle(database, row)}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
    </div>
  );
}

export { PREVIEW_ROW_LIMIT };
