/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DatabaseTemplateEditorSidebar } from "@/components/database/row-page/database-template-editor-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const mocks = vi.hoisted(() => ({
  clearDatabaseRowPage: vi.fn(() => true),
  dispatch: vi.fn(),
  pages: [
    {
      id: "page-1",
      title: "Seeded",
      slug: "/seeded",
      parentId: null,
      routeBy: "slug" as const,
      databaseRowSource: { databaseId: "db-1", rowId: "row-1" },
    },
  ],
}));

vi.mock("@/components/database/use-database-path-target.ts", () => ({
  useDatabasePathTargets: () => ({ hub: undefined }),
}));

vi.mock("@/hooks/use-page-dispatch.ts", () => ({
  usePageDispatch: () => mocks.dispatch,
}));

vi.mock("@/hooks/use-page-list.ts", () => ({
  useMergedPageListItems: () => ({ pages: mocks.pages }),
}));

vi.mock("@/components/layout/device-layout-provider.tsx", async (orig) => ({
  ...(await orig<object>()),
  useIsCoarsePrimaryPointer: () => false,
  useIsNarrowViewport: () => false,
}));

vi.mock("@/components/layout/haptics-provider.tsx", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useHaptics: () => vi.fn(),
}));

vi.mock("@/lib/databases/clear-database-row-pages.ts", () => ({
  clearDatabaseRowPage: mocks.clearDatabaseRowPage,
  clearDatabaseRowPages: vi.fn(),
  isDatabaseRowPageMaterialized: (row: LocalDatabaseRow) => Boolean(row.pageId),
  listMaterializedDatabaseRowPageIds: () => ["page-1"],
}));

vi.mock(
  "@/components/database/row-page/clear-row-pages-confirm-dialog.tsx",
  () => ({
    ClearRowPagesConfirmDialog: ({
      onConfirm,
      open,
    }: {
      onConfirm: () => void;
      open: boolean;
    }) =>
      open ? (
        <button onClick={onConfirm} type="button">
          Confirm clear
        </button>
      ) : null,
  })
);

vi.mock("@/components/ui/tooltip.tsx", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
}));

vi.mock("@/lib/toast/app-toast.ts", () => ({
  appToast: { success: vi.fn() },
}));

const DATABASE: LocalDatabase = {
  id: "db-1",
  name: "Tasks",
  primaryFieldId: "f-title",
  fields: [{ id: "f-title", name: "Name", type: "text" }],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const MATERIALIZED_ROW: LocalDatabaseRow = {
  id: "row-1",
  databaseId: DATABASE.id,
  pageId: "page-1",
  values: { "f-title": "Seeded" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const TEMPLATE_ROW: LocalDatabaseRow = {
  ...MATERIALIZED_ROW,
  id: "row-2",
  pageId: undefined,
  values: { "f-title": "Template-backed" },
};

describe("DatabaseTemplateEditorSidebar", () => {
  it("disables materialized previews and offers per-row Clear content", () => {
    const setPreviewRowId = vi.fn();
    render(
      <SidebarProvider>
        <DatabaseTemplateEditorSidebar
          database={DATABASE}
          previewRows={[MATERIALIZED_ROW, TEMPLATE_ROW]}
          setPreviewRowId={setPreviewRowId}
        />
      </SidebarProvider>
    );

    expect(
      screen.getByRole("button", { name: "Seeded" }).hasAttribute("disabled")
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Template-backed" }));
    expect(setPreviewRowId).toHaveBeenCalledWith("row-2");

    fireEvent.click(
      screen.getByRole("button", { name: "Clear content for Seeded" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));

    expect(mocks.clearDatabaseRowPage).toHaveBeenCalledWith({
      dispatchPage: mocks.dispatch,
      pages: mocks.pages,
      row: MATERIALIZED_ROW,
    });
  });
});
