/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

const mocks = vi.hoisted(() => ({
  databases: [] as LocalDatabase[],
}));

vi.mock("@/hooks/use-local-databases.ts", () => ({
  useLocalDatabasesSnapshot: () => mocks.databases,
}));

import { DatabaseBlockDeleteDialog } from "@/components/canvas/database-block-delete-dialog.tsx";

const SINGLE_DATABASE_COPY = /"Reading list" and all of its rows/;
const CASCADE_COPY = /Linked database blocks on every page will be removed/;
const MULTI_DATABASE_COPY = /"Books", "Films" and all of their rows/;
const DELETE_BUTTON = /^Delete/;
const CANCEL_BUTTON = /^Cancel/;

function database(id: string, name: string): LocalDatabase {
  return { id, name } as LocalDatabase;
}

function renderDialog(ui: ReactNode) {
  return render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      {ui}
    </DeviceLayoutProvider>
  );
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
  mocks.databases = [];
});

describe("DatabaseBlockDeleteDialog", () => {
  it("stays closed while no database delete is pending", () => {
    renderDialog(
      <DatabaseBlockDeleteDialog
        databaseIds={null}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the database and warns about the cascade", () => {
    mocks.databases = [database("db-1", "Reading list")];
    renderDialog(
      <DatabaseBlockDeleteDialog
        databaseIds={["db-1"]}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText("Delete database?")).toBeTruthy();
    expect(screen.getByText(SINGLE_DATABASE_COPY)).toBeTruthy();
    expect(screen.getByText(CASCADE_COPY)).toBeTruthy();
  });

  it("pluralizes when a selection spans several databases", () => {
    mocks.databases = [database("db-1", "Books"), database("db-2", "Films")];
    renderDialog(
      <DatabaseBlockDeleteDialog
        databaseIds={["db-1", "db-2"]}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText("Delete 2 databases?")).toBeTruthy();
    expect(screen.getByText(MULTI_DATABASE_COPY)).toBeTruthy();
  });

  it("confirms the delete", () => {
    mocks.databases = [database("db-1", "Books")];
    const onConfirm = vi.fn();
    renderDialog(
      <DatabaseBlockDeleteDialog
        databaseIds={["db-1"]}
        onCancel={() => undefined}
        onConfirm={onConfirm}
      />
    );

    screen.getByRole("button", { name: DELETE_BUTTON }).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without deleting", () => {
    mocks.databases = [database("db-1", "Books")];
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderDialog(
      <DatabaseBlockDeleteDialog
        databaseIds={["db-1"]}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    screen.getByRole("button", { name: CANCEL_BUTTON }).click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
