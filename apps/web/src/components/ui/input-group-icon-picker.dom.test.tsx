/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { InputGroupIconPicker } from "@/components/ui/input-group-icon-picker.tsx";

// Swap the code-split emoji/icon panels for the real `GridPicker` over a tiny
// item list: the search field under test is the same shared InputGroup +
// Autocomplete input the shipped panels render, without the deferred catalogs.
vi.mock("@/lib/pages/preload-page-icon-picker.ts", async () => {
  const { GridPicker } = await import("@/components/ui/grid-picker.tsx");
  const items = ["star", "sun", "moon"];
  const Panel = ({ onSelect }: { onSelect: (icon: string) => void }) => (
    <GridPicker<string>
      emptyMessage="No icons found."
      getItemLabel={(item) => item}
      getKey={(item) => item}
      getSearchValue={(item) => item}
      items={items}
      onSelect={(item) => onSelect(`tabler:${item}`)}
      renderItem={(item) => <span>{item}</span>}
      searchAriaLabel="Search icons"
      searchPlaceholder="Search icons…"
    />
  );
  return {
    ensurePageIconPickerReady: () => undefined,
    preloadPageIconEmojiPanel: () => Promise.resolve(Panel),
    preloadPageIconIconPanel: () => Promise.resolve(Panel),
  };
});

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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        /* no-op */
      }
      unobserve() {
        /* no-op */
      }
      disconnect() {
        /* no-op */
      }
    }
  );
  // Base UI's ScrollArea viewport waits on the Web Animations API, which jsdom
  // does not implement.
  Element.prototype.getAnimations ??= () => [];
});

afterEach(cleanup);

function RenameRow() {
  const [open, setOpen] = useState(false);
  return (
    <InputGroupIconPicker
      ariaLabel="Change view icon"
      fallbackIcon={<span>fallback</span>}
      onOpenChange={setOpen}
      onSelect={() => undefined}
      open={open}
    />
  );
}

function Providers({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        {children}
      </DeviceLayoutProvider>
    </QueryClientProvider>
  );
}

/** Opens the picker popover and returns its search input. */
async function openPicker() {
  fireEvent.click(screen.getByLabelText("Change view icon"));
  return await screen.findByLabelText("Search icons");
}

/**
 * Types into the picker's search field. `keyDownDelivered` is false when the
 * host menu's typeahead swallowed the key by calling `preventDefault()`.
 */
function typeIntoSearch(input: HTMLElement) {
  const keyDownDelivered = fireEvent.keyDown(input, { key: "s" });
  fireEvent.change(input, { target: { value: "star" } });
  return {
    keyDownDelivered,
    openMenus: screen.queryAllByRole("menu").length,
    value: (input as HTMLInputElement).value,
  };
}

describe("InputGroupIconPicker inside menus", () => {
  it("accepts typing in the search input from a dropdown submenu", async () => {
    render(
      <Providers>
        <DropdownMenu>
          <DropdownMenuTrigger>Database settings</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Views</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <RenameRow />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </Providers>
    );

    fireEvent.click(screen.getByText("Database settings"));
    fireEvent.click(await screen.findByText("Views"));

    const result = typeIntoSearch(await openPicker());

    expect(result.keyDownDelivered).toBe(true);
    expect(result.value).toBe("star");
    expect(result.openMenus).toBeGreaterThan(0);
  });

  it("accepts typing in the search input from a top-level context menu", async () => {
    render(
      <Providers>
        <ContextMenu>
          <ContextMenuTrigger>
            <button type="button">Table</button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <RenameRow />
          </ContextMenuContent>
        </ContextMenu>
      </Providers>
    );

    fireEvent.contextMenu(screen.getByText("Table"));
    await screen.findByRole("menu");

    const result = typeIntoSearch(await openPicker());

    expect(result.keyDownDelivered).toBe(true);
    expect(result.value).toBe("star");
    expect(result.openMenus).toBeGreaterThan(0);
  });

  it("still lets Escape reach the menu so the stack can close", async () => {
    render(
      <Providers>
        <DropdownMenu>
          <DropdownMenuTrigger>Database settings</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Views</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <RenameRow />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </Providers>
    );

    fireEvent.click(screen.getByText("Database settings"));
    fireEvent.click(await screen.findByText("Views"));
    const input = await openPicker();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByLabelText("Search icons")).toBeNull();
  });
});
