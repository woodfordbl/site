/** @vitest-environment node */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DatabaseEdit } from "@/components/blocks/types/database/database-edit.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

/**
 * @fileoverview Server-render guard for the `database` block.
 *
 * The local collections are read through `useLiveQuery`, which subscribes
 * without a server snapshot: reaching one during SSR aborts the entire page
 * render and reverts it to client rendering, so every page holding a database
 * block would serve crawlers an empty shell. `renderToString` uses the same
 * server dispatcher as the real render, so an unguarded hook throws here.
 */

const row = { rowId: "row-1" } as CanvasRow;

describe("DatabaseEdit on the server", () => {
  it("renders a linked block without reaching a live query", () => {
    const html = renderToString(
      <DatabaseEdit
        onChange={vi.fn()}
        props={{ databaseId: "282bddac-7bb0-4ee7-9313-ee99a933eeb1" }}
        row={row}
      />
    );

    expect(html).toContain("Database block");
  });
});
