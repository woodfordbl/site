/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DatabaseSyncStatusChip,
  REFRESH_SPIN_MIN_MS,
} from "@/components/database/database-sync-status-chip.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import type { DatabaseSyncStatus } from "@/db/sync/database-sync-engine.ts";

let currentStatus: DatabaseSyncStatus = { syncing: false };
const statusListeners = new Set<() => void>();

function publishStatus(next: DatabaseSyncStatus): void {
  currentStatus = next;
  for (const listener of statusListeners) {
    listener();
  }
}

const { requestImmediateSync } = vi.hoisted(() => ({
  requestImmediateSync: vi.fn((): boolean => true),
}));

vi.mock("@/hooks/use-sync-status.ts", () => ({
  useSyncStatus: (_databaseId: string): DatabaseSyncStatus =>
    useSyncExternalStore(
      (onStoreChange) => {
        statusListeners.add(onStoreChange);
        return () => {
          statusListeners.delete(onStoreChange);
        };
      },
      () => currentStatus
    ),
}));

vi.mock("@/db/sync/database-sync-engine.ts", () => ({
  requestImmediateSync,
}));
function renderChip() {
  return render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <TooltipProvider>
        <DatabaseSyncStatusChip databaseId="db-1" />
      </TooltipProvider>
    </DeviceLayoutProvider>
  );
}

function refreshButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: "Sync status — refresh now",
  }) as HTMLButtonElement;
}

function refreshIcon(): SVGElement | null {
  return refreshButton().querySelector("svg");
}

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
  currentStatus = { syncing: false };
  statusListeners.clear();
  requestImmediateSync.mockReset();
  requestImmediateSync.mockImplementation(() => true);
  vi.useRealTimers();
});

describe("DatabaseSyncStatusChip refresh spin", () => {
  it("spins while a refresh is unresolved and stops after success", () => {
    vi.useFakeTimers();
    requestImmediateSync.mockImplementation(() => {
      publishStatus({ syncing: true });
      return true;
    });
    renderChip();

    fireEvent.click(refreshButton());

    expect(requestImmediateSync).toHaveBeenCalledWith("db-1");
    expect(refreshButton().getAttribute("aria-busy")).toBe("true");
    expect(refreshIcon()?.classList.contains("animate-spin")).toBe(true);
    expect(
      refreshIcon()?.classList.contains("motion-reduce:animate-none")
    ).toBe(true);

    // Second click while in flight must not start another pass.
    fireEvent.click(refreshButton());
    expect(requestImmediateSync).toHaveBeenCalledTimes(1);

    act(() => {
      publishStatus({
        lastSyncedAt: "2026-07-31T00:00:00.000Z",
        syncing: false,
      });
    });

    // Minimum visible hold keeps the class until the timer elapses.
    expect(refreshIcon()?.classList.contains("animate-spin")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(REFRESH_SPIN_MIN_MS);
    });

    expect(refreshButton().getAttribute("aria-busy")).toBeNull();
    expect(refreshIcon()?.classList.contains("animate-spin")).toBe(false);
  });

  it("stops the spin after a rejected pass and never spins on refusal", () => {
    vi.useFakeTimers();
    requestImmediateSync.mockImplementation(() => {
      publishStatus({
        error: {
          at: "2026-07-31T00:00:00.000Z",
          kind: "network",
          message: "Upstream timed out",
        },
        syncing: true,
      });
      return true;
    });
    renderChip();

    fireEvent.click(refreshButton());
    expect(refreshIcon()?.classList.contains("animate-spin")).toBe(true);

    act(() => {
      publishStatus({
        error: {
          at: "2026-07-31T00:00:01.000Z",
          kind: "network",
          message: "Upstream timed out",
        },
        syncing: false,
      });
    });
    // Effect arms the min-hold timer after the idle transition — advance
    // in a separate act so the timeout exists first.
    act(() => {
      vi.advanceTimersByTime(REFRESH_SPIN_MIN_MS);
    });

    expect(refreshIcon()).toBeNull();
    expect(refreshButton().querySelector("span")).toBeTruthy();
    expect(refreshButton().getAttribute("aria-busy")).toBeNull();

    requestImmediateSync.mockImplementation(() => false);
    fireEvent.click(refreshButton());
    expect(requestImmediateSync).toHaveBeenLastCalledWith("db-1");
    expect(refreshIcon()).toBeNull();
    expect(refreshButton().getAttribute("aria-busy")).toBeNull();
  });

  it("spins immediately on keyboard activation", () => {
    requestImmediateSync.mockImplementation(() => {
      publishStatus({ syncing: true });
      return true;
    });
    renderChip();

    const button = refreshButton();
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);

    expect(refreshIcon()?.classList.contains("animate-spin")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
