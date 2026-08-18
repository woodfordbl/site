/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import { formulaTokenMark } from "@/lib/blocks/inline-formula.ts";
import type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { FORMULA_TOKEN_SENTINEL as S } from "@/lib/schemas/rich-text.ts";

/**
 * @fileoverview The body of a row that has no page of its own: the database's
 * template, instantiated for the row and rendered read-only.
 *
 * A row page is the one surface where a template's tokens have to resolve
 * without an editor — nothing here is editable, so the read-only renderer is
 * the only thing that can print a value. A token showing its pending
 * placeholder here shows it for as long as the page is open.
 */

const model = vi.hoisted(() => ({
  current: null as InlineFormulaPageModel | null,
}));

vi.mock("@/components/editor/inline-formula-page.tsx", () => ({
  useInlineFormulaPage: () => model.current,
}));

// Browser-only workspace collections; the formula evaluation runs for real.
vi.mock("@/db/queries/use-database.ts", () => ({ useAllDatabases: () => [] }));
vi.mock("@/db/queries/use-formula-functions.ts", () => ({
  useFormulaUserFunctions: () => [],
}));
vi.mock("@/lib/databases/formula-relations.ts", () => ({
  localFormulaRelationResolver: () => ({}),
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

const SITE: DatabaseField = { id: "f-site", name: "Site", type: "text" };

const ROW: LocalDatabaseRow = {
  createdAt: "2026-08-01T00:00:00.000Z",
  databaseId: "db-launches",
  id: "row-1",
  updatedAt: "2026-08-01T00:00:00.000Z",
  values: { "f-site": "Cape Canaveral" },
};

/** What the template editor stores for `Launches from $Site today.` */
const TEMPLATE: Block[] = [
  {
    id: "b-1",
    type: "text",
    props: {
      text: `Launches from ${S} today.`,
      marks: [formulaTokenMark(14, "thisPage.Site")],
    },
  },
];

afterEach(() => {
  model.current = null;
  cleanup();
});

describe("virtual row page body", () => {
  it("prints the row's own value for a template token", () => {
    model.current = {
      cellValues: ROW.values,
      databaseFields: [SITE],
      page: {
        createdAt: ROW.createdAt,
        title: "Falcon 9",
        updatedAt: ROW.updatedAt,
      },
    };

    const { container } = render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <CanvasBlocksReadOnly
          blocks={instantiateTemplateBlocks(TEMPLATE, [SITE], ROW.values)}
          mode="view"
          pageId={ROW.id}
        />
      </DeviceLayoutProvider>
    );

    expect(container.textContent).toContain(
      "Launches from Cape Canaveral today."
    );
    expect(container.textContent).not.toContain(S);
  });
});
