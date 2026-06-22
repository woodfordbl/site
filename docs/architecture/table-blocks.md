# Table blocks

Notion-style editable grids: a **table** container holds **tableRow** rows, each holding **tableCell** leaves with plain text. Persistence stays in the flat block collection (same pattern as lists and columns); ShadCN [`Table`](../../src/components/ui/table.tsx) provides semantic markup only — no TanStack Table.

## Block hierarchy

| Block | Kind | Props | Children |
|-------|------|-------|----------|
| `table` | container | `hasHeaderRow: boolean`, `hasHeaderColumn: boolean`, `columnWidths: number[]` (pixel widths, default 120px) | `tableRow` only |
| `tableRow` | container | `{}` | `tableCell` only (sibling order = column index) |
| `tableCell` | leaf | `{ text: string }` | none |

Defaults on slash create: **3×3**, `hasHeaderRow: true`, equal pixel `columnWidths` (`DEFAULT_TABLE_COLUMN_WIDTH` = 120px per column). Legacy stored ratios ≤10 migrate to px at render. Limits: `MIN_TABLE_COLUMNS = 2`, `MIN_TABLE_ROWS = 1`, `MAX_TABLE_COLUMNS = 10`.

Tables work at canvas root and inside **column** containers (`allowedChildTypes: *`). The wrapper uses `w-full min-w-0` with horizontal scroll when column widths exceed the parent. On overflow, the edit layout bleeds `-mx-12 w-[calc(100%+6rem)]` into both canvas horizontal paddings; scroll content pairs `px-12` / `-mx-12` so max scroll aligns the table’s leading and trailing edges with the panel padding (and the block gutter scrolls with the table).

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

[`TableView`](../../src/components/blocks/types/table/table-view.tsx) renders the full grid — cells do **not** go through [`BlockTreeNode`](../../src/components/canvas/block-tree-node.tsx) (no gutters inside the grid). The outer table block keeps the normal canvas gutter for Turn into / Delete / Duplicate in edit mode; that gutter lives inside the table’s horizontal scroll area (with a reserved gutter column on the row shell so content alignment matches other blocks).

Layout markers:

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `data-table-layout` | wrapper | DnD scope |
| `data-table-id` | wrapper | table block id |
| `data-table-row-id` | `<tr>` | row reorder hit-test (body rows also carry `data-canvas-row-id`) |
| `data-table-column-index` | cell | column index metadata |
| `data-table-column-drag-id` | header cell (or first body row when no header) | column DnD source id `{tableId}:{index}` |
| `data-table-column-handle` | structure handle button | column index (for `:has()` reveal selectors) |
| `data-table-structure-handle` | row/column handle button | structure menu + DnD source |

### Structure handles {#structure-handles}

Row and column chrome share [`TableStructureHandle`](../../src/components/blocks/types/table/table-structure-handle.tsx) via [`TableRowHandle`](../../src/components/blocks/types/table/table-row-handle.tsx) (left edge, body rows) and [`TableColumnHandle`](../../src/components/blocks/types/table/table-column-handle.tsx) (top edge, header cells — or first body row when `hasHeaderRow` is false). Handles stay hidden at rest (`opacity-0`) and reveal on hover:

- **Rows** — `group-hover/table-row:opacity-100` on the row handle (first column only).
- **Columns** — wrapper `group/table-layout` gets per-column `:has([data-table-column-index="n"]:hover)` rules from [`getTableColumnHandleRevealClasses`](../../src/components/blocks/types/table/table-structure-selection.ts) so hovering any cell in a column shows that column’s top handle.

**Click** (press and release without drag) selects the row or column and opens [`TableStructureHandleMenu`](../../src/components/blocks/types/table/table-structure-handle-menu.tsx) (insert, duplicate, clear contents, delete). **Drag** reorders: rows use the canvas row channel (`useCanvasRowSurface` + [`CanvasRowDndBridge`](../../src/components/dnd/canvas-row-dnd-bridge.tsx)); columns use the nested table column surface. Header row has no row handle when `hasHeaderRow`.

**Structure selection:** click opens the structure menu and sets local `TableStructureSelection` state; affected cells get a 2px primary outer perimeter (`border-*-2 border-*-primary` via [`getTableCellStructureSelectionClassName`](../../src/components/blocks/types/table/table-structure-selection.ts)). Selection clears when the menu closes (Escape, outside click, menu action, or drag). The structure menu uses the grab trigger with `align="start"` (`side="bottom"` for columns, `side="right"` for rows).

Header row: first `tableRow` uses muted `TableHead` styling; column handles and a full-height [`TableColumnResizeOverlay`](../../src/components/blocks/types/table/table-column-resize-zone.tsx) appear in edit mode.

Column widths: `<colgroup>` pixel widths from `columnWidths` (legacy ratio values ≤10 migrate to px at render); live preview during resize via [`use-table-column-resize.ts`](../../src/components/blocks/types/table/use-table-column-resize.ts) — only the dragged column changes width. Resize hover uses `bg-sidebar-border` (same as sidebar rail).

Horizontal scroll: Base UI [`ScrollArea`](../../src/components/ui/scroll-area.tsx) with a horizontal scrollbar (auto-hide at rest via global CSS). No edge fade on tables. In edit mode the wrapper bleeds `-mx-12 w-[calc(100%+6rem)]` into both canvas horizontal paddings; scroll content uses matching `px-12` / `-mx-12` so the table stays left-aligned at rest but can scroll until its leading edge (row handles, block gutter) and trailing edge meet the panel padding. The block gutter (`RowGutter`) is the first column inside scroll content and scrolls horizontally with the table. View mode keeps the prior right-only bleed (`-mr-12`, `pl-12` / `-ml-12`). The table wrapper uses `pt-3 pl-3 pr-8` so structure-handle pills and the add-column gutter sit inside scroll content (not clipped by the viewport). Scroll content width is the gutter (edit) + table (+ horizontal inset + add-row strip below); [`TableAddColumnButton`](../../src/components/blocks/types/table/table-controls.tsx) is absolutely positioned in the trailing `pr-8` gutter beside the last column. Add row/column: hover `TableAddRowButton` / `TableAddColumnButton` and block menu actions on the selected table block.

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
| `table.addRow` | Insert row with matching column count; anchor `tableRowId` + `edge` (`before` \| `after`) |
| `table.addColumn` | Insert empty cell in every row at `columnIndex` + `edge`; extend `columnWidths` |
| `table.duplicateColumn` | Clone cell text in every row; insert duplicate at `columnIndex + 1` |
| `table.removeRow` | Blocked at `MIN_TABLE_ROWS`; clearing header clears `hasHeaderRow` |
| `table.removeColumn` | Blocked at `MIN_TABLE_COLUMNS` |
| `table.reorderColumn` | Batch `move` per row + splice `columnWidths` |
| `table.toggleHeaderRow` | `persist` table props only |
| `table.toggleHeaderColumn` | `persist` table props only |
| `table.fitToWidth` | Proportionally scale `columnWidths` to a target viewport width |
| `table.updateColumnWidths` | Commit resize |
| `table.focusCell` | Tab/Enter grid navigation |

**Row reorder:** existing `row.move` / `row.moveToPosition` among `tableRow` siblings (subtree move preserves cells).

Slash menu: **Table** via `table.create` (default 3×3 grid). Registry: [`registry.ts`](../../src/components/blocks/registry.ts).

## Drag-and-drop

Two scopes inside `[data-table-layout]`:

1. **Row reorder** — canvas row channel (`application/x-canvas-row-id`) on [`TableRowHandle`](../../src/components/blocks/types/table/table-row-handle.tsx) via `useCanvasRowSurface` (preserved through nested column DnD by [`CanvasRowDndBridge`](../../src/components/dnd/canvas-row-dnd-bridge.tsx) on [`PageCanvasEditor`](../../src/components/canvas/page-canvas-editor.tsx)). Resolver: [`resolveTableLayoutDrop`](../../src/lib/canvas/resolve-table-drop-target.ts) (vertical midpoint bands on full-width `[data-table-row-id]` rects pinned to the `<table>` left/right). Header row (`r1` when `hasHeaderRow`) is not draggable. Drag previews ([`TableRowDragPreview`](../../src/components/blocks/types/table/table-row-drag-preview.tsx)) show the primary-bordered row plus the left grip handle; the source handle hides while dragging.
2. **Column reorder** — nested [`DndSurface`](../../src/components/dnd/dnd-surface.tsx) (`TableColumnDnD`) with `application/x-table-column-index`; horizontal midpoint bands on full-height column strips from [`collectTableColumnDropRects`](../../src/lib/dnd/collect-table-column-rects.ts) (merges every `[data-table-column-index]` cell in the column, pinned to the `<table>` top/bottom) → `table.reorderColumn`. [`TableStructureDropIndicators`](../../src/components/blocks/types/table/table-structure-drop-indicators.tsx) renders one full-height vertical or full-width horizontal `bg-primary` line at the active boundary. Drag previews ([`TableColumnDragPreview`](../../src/components/blocks/types/table/table-column-drag-preview.tsx)) show the primary-bordered column plus the top grip handle; the source handle hides while dragging.

[`resolve-drop-target.ts`](../../src/lib/canvas/resolve-drop-target.ts) calls the table row resolver before columns/canvas fallback when the pointer is inside a table layout. Column drops resolve inside `TableColumnDnD`, not the top-level canvas resolver.

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
