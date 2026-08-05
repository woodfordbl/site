/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import { PageRowMenuContent } from "@/components/pages/page-row-menu-content.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu.tsx";
import { assertNoOrphanMenuSeparators } from "@/lib/ui/menu-separators.ts";

vi.mock("@/components/pages/page-activity-panel.tsx", () => ({
  PageActivityPanel: () => (
    <div data-testid="page-activity">
      <span>Created at</span>
      <span>Last edited at</span>
    </div>
  ),
}));

vi.mock("@/components/pages/page-menu-move-submenu.tsx", () => ({
  PageMenuMoveSubmenu: () => null,
}));

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
});

describe("PageRowMenuContent separators", () => {
  it("has no leading, trailing, or adjacent separators", () => {
    render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <DropdownMenu open>
          <DropdownMenuContent>
            <PageRowMenuContent
              canDelete
              canResetToRemote={false}
              isFavorite={false}
              onChangeIcon={() => undefined}
              onCopyLink={() => undefined}
              onDelete={() => undefined}
              onDuplicate={() => undefined}
              onEditTemplate={() => undefined}
              onMoveTo={() => undefined}
              onRename={() => undefined}
              onResetToRemote={() => undefined}
              onSaveAsTemplate={() => undefined}
              onToggleFavorite={() => undefined}
              pageId="page-1"
              pages={[]}
              variant="dropdown"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </DeviceLayoutProvider>
    );

    expect(screen.getByTestId("page-activity")).toBeTruthy();
    assertNoOrphanMenuSeparators(screen.getByRole("menu"));
  });
});
