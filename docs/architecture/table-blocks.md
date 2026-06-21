# Table blocks

Notion-style editable grids: a **table** container holds **tableRow** rows, each holding **tableCell** leaves with plain text. Persistence stays in the flat block collection (same pattern as lists and columns); ShadCN [`Table`](../../src/components/ui/table.tsx) provides semantic markup only — no TanStack Table.

## Block hierarchy

| Block | Kind | Props | Children |
|-------|------|-------|----------|
| `table` | container | `hasHeaderRow: boolean`, `columnWidths: number[]` (pixel widths, default 120px) | `tableRow` only |
| `tableRow` | container | `{}` | `tableCell` only (sibling order = column index) |
| `tableCell` | leaf | `{ text: string }` | none |

Defaults on slash create: **3×3**, `hasHeaderRow: true`, equal `columnWidths: [1, 1, 1]`. Limits: `MIN_TABLE_COLUMNS = 2`, `MIN_TABLE_ROWS = 1`, `MAX_TABLE_COLUMNS = 10`.

Tables work at canvas root and inside **column** containers (`allowedChildTypes: *`). The wrapper uses `w-full min-w-0` with horizontal scroll when column widths exceed the parent. On overflow, the layout bleeds `-mr-12 w-[calc(100%+3rem)]` into the canvas right padding; scroll content pairs `pl-12` / `-ml-12` so max scroll aligns the table’s trailing edge with the normal content boundary.

## Worked example (test fixture)

Flat storage for a 3×3 table with header row:

```
t1  table      hasHeaderRow: true, columnWidths: [1,1,1]
├── r1  tableRow
│   ├── c1  tableCell  "Name"
│   ├── c2  tableCell  "Role"
│   └── c3  tableCell  "Team"
├── r2  tableRow
│   ├── c4  tableCell  "Ada"
│   ├── c5  tableCell  "Eng"
│   └── c6  tableCell  "Core"
└── r3  tableRow
    ├── c7  tableCell  "Lin"
    ├── c8  tableCell  "Design"
    └── c9  tableCell  "UX"
```

When `hasHeaderRow` is true, `r1` renders in `<TableHeader>`; body rows are `r2` and `r3`. Column reorder (`table.reorderColumn` from index 1 → 0) permutes cells in **every** row and splices `columnWidths` — e.g. row `r1` becomes `[c2, c1, c3]`.

Planners live in [`table-layout.ts`](../../src/lib/canvas/table-layout.ts); `deriveTableGrid(tableRow)` projects the nested tree for UI and tests.

## Rendering

[`TableView`](../../src/components/blocks/types/table/table-view.tsx) renders the full grid — cells do **not** go through [`BlockTreeNode`](../../src/components/canvas/block-tree-node.tsx) (no gutters inside the grid). The outer table block keeps the normal canvas gutter for Turn into / Delete / Duplicate.

Layout markers:

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `data-table-layout` | wrapper | DnD scope |
| `data-table-id` | wrapper | table block id |
| `data-table-row-id` | `<tr>` | row reorder hit-test |
| `data-table-column-index` | cell | column index metadata |
| `data-table-column-drag-id` | header cell | column DnD source id `{tableId}:{index}` |

Header row: first `tableRow` uses muted `TableHead` styling; column drag handles and a full-height [`TableColumnResizeOverlay`](../../src/components/blocks/types/table/table-column-resize-zone.tsx) appear in edit mode. Body rows: leading grip column (`TableRowHandle`) for row DnD; header row grip is hidden when `hasHeaderRow`. Clicking a row/column structure handle selects that row or column and draws an outside `var(--accent)` perimeter on its cells (cleared when a cell receives text focus).

Column widths: `<colgroup>` pixel widths from `columnWidths` (legacy ratio values ≤10 migrate to px at render); live preview during resize via [`use-table-column-resize.ts`](../../src/components/blocks/types/table/use-table-column-resize.ts) — only the dragged column changes width. Resize hover uses `bg-sidebar-border` (same as sidebar rail).

Horizontal scroll: Base UI [`ScrollArea`](../../src/components/ui/scroll-area.tsx) with a horizontal scrollbar (auto-hide at rest via global CSS). No edge fade on tables. The wrapper bleeds `-mr-12 w-[calc(100%+3rem)]` into canvas right padding; scroll content uses matching `pl-12` / `-ml-12` so the table stays left-aligned at rest but can scroll until its trailing edge meets the normal content boundary (not the bled panel edge). The table wrapper uses `pt-3 pl-3 pr-3` so structure-handle pills and the add-column gutter sit inside scroll content (not clipped by the viewport). Scroll content width is the table (+ horizontal inset + add-row strip below); [`TableAddColumnButton`](../../src/components/blocks/types/table/table-controls.tsx) is absolutely positioned in the trailing `pr-3` gutter beside the last column. Add row/column: hover `TableAddRowButton` / `TableAddColumnButton` and block menu actions on the selected table block.

## Cell keyboard

Handled in [`table-cell-edit.tsx`](../../src/components/blocks/types/table/table-cell-edit.tsx) via `table.focusCell`:

| Key | Action |
|-----|--------|
| Tab | Next cell (wrap row) |
| Shift+Tab | Previous cell |
| Enter | Cell below (same column); last row → `table.addRow` after |
| Shift+Enter | Newline in cell (`EditableSurface` multiline) |
| Backspace/Delete (empty) | Clear text only — grid structure preserved |

Empty cell Backspace does **not** delete the row or column (Notion-style).

## Structural commands

Table-scoped commands use **`tableId`** for batch column ops (`reorderColumn`, `toggleHeaderRow`, `updateColumnWidths`). Row/column add/remove anchor on `tableRowId` + index where noted.

| Command | Planner / behavior |
|---------|-------------------|
| `table.create` | Replace source row; seed first header/body cell from slash text |
| `table.addRow` | Insert row with `columnCount` empty cells |
| `table.addColumn` | Insert empty cell in every row; extend `columnWidths` |
| `table.removeRow` | Blocked at `MIN_TABLE_ROWS`; clearing header clears `hasHeaderRow` |
| `table.removeColumn` | Blocked at `MIN_TABLE_COLUMNS` |
| `table.reorderColumn` | Batch `move` per row + splice `columnWidths` |
| `table.toggleHeaderRow` | `persist` table props only |
| `table.updateColumnWidths` | Commit resize |
| `table.focusCell` | Tab/Enter grid navigation |

**Row reorder:** existing `row.move` / `row.moveToPosition` among `tableRow` siblings (subtree move preserves cells).

Slash menu: **Table** via `table.create` (default 3×3 grid). Registry: [`registry.ts`](../../src/components/blocks/registry.ts).

## Drag-and-drop

Two scopes inside `[data-table-layout]`:

1. **Row reorder** — canvas row channel (`application/x-canvas-row-id`) on body row grips. Resolver: [`resolveTableLayoutDrop`](../../src/lib/canvas/resolve-table-drop-target.ts) (vertical bands on `[data-table-row-id]`). Header row (`r1` when `hasHeaderRow`) is not draggable.
2. **Column reorder** — nested [`DndSurface`](../../src/components/dnd/dnd-surface.tsx) with `application/x-table-column-index`; horizontal bands on header cells → `table.reorderColumn`.

[`resolve-drop-target.ts`](../../src/lib/canvas/resolve-drop-target.ts) calls the table resolver before columns/canvas fallback when the pointer is inside a table layout.

See [drag-and-drop — Table layout](./drag-and-drop.md#table-layout).

## Container policy

From [`block-container-config.ts`](../../src/lib/canvas/block-container-config.ts):

- `table` → children `tableRow` only; no canvas Enter sibling insert
- `tableRow` → children `tableCell` only; custom cell keyboard (no list lift-out)

Normalization: [`ensureTableMinimumGrid`](../../src/lib/blocks/normalize-block.ts) pads short rows and syncs `columnWidths` length (piped through [`buildBlockTree`](../../src/lib/blocks/block-tree.ts)).

## Out of scope (v1)

Rich blocks inside cells, merge/split, formulas, sort/filter, CSV, Turn into unwrap to text blocks, keyboard column reorder.

## Related

- [Block model — table tree](./block-model.md)
- [Block types — container specs](./block-types.md)
- [Canvas commands — table.*](../reference/canvas-commands.md)
- [Drag-and-drop](./drag-and-drop.md)
