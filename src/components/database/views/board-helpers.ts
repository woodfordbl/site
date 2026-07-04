import { groupKeyForRow } from "@/lib/databases/row-group.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

/**
 * Pure board (kanban) view logic: group-field resolution, column building
 * from select options, card-field selection, and drop-target resolution over
 * measured card/column rects. Kept free of React/DOM so the column and drop
 * semantics stay unit-testable.
 */

/** A select field — the only field type that can drive board columns (v1). */
export type BoardGroupField = DatabaseField & { type: "select" };

/** One rendered board column, in display order. */
export interface BoardColumn {
  /** Select-option color for the header dot; unset for colorless columns. */
  color?: BlockColor;
  /**
   * Stable column key: the option id, a stale option id still stored on
   * rows, or `""` for the trailing "No <field>" column. Matches
   * `groupKeyForRow` and is what `board.hiddenColumnIds` stores.
   */
  key: string;
  /** Header label: option name, the raw stale id, or "No <field>". */
  label: string;
  /** Cards in the column, preserving the incoming (filtered + sorted) order. */
  rows: LocalDatabaseRow[];
  /**
   * The cell value the column represents, writable to the group field: the
   * option id, or `null` for the empty column (per-column add + drops seed
   * rows with it).
   */
  value: string | null;
}

/**
 * Resolve the board's group field: `view.config.board.groupFieldId` when it
 * points at a live select field, otherwise the first select field in the
 * schema. `null` (no select field at all) gates the board's empty state.
 */
export function resolveBoardGroupField(
  fields: readonly DatabaseField[],
  view: DatabaseView
): BoardGroupField | null {
  const configuredId = view.config.board?.groupFieldId;
  if (configuredId !== undefined) {
    const configured = fields.find((field) => field.id === configuredId);
    if (configured?.type === "select") {
      return configured;
    }
  }
  const firstSelect = fields.find((field) => field.type === "select");
  return firstSelect?.type === "select" ? firstSelect : null;
}

/**
 * Fields rendered on cards under the primary title:
 * `view.config.board.cardFieldIds` resolved against the schema (stale ids
 * drop out, the primary field never repeats), else the first two non-primary
 * fields excluding the group field (its value IS the column).
 */
export function resolveBoardCardFields(
  fields: readonly DatabaseField[],
  view: DatabaseView,
  primaryFieldId: string,
  groupFieldId: string
): DatabaseField[] {
  const configuredIds = view.config.board?.cardFieldIds;
  if (configuredIds) {
    const result: DatabaseField[] = [];
    for (const fieldId of configuredIds) {
      const field = fields.find((entry) => entry.id === fieldId);
      if (field && field.id !== primaryFieldId && !result.includes(field)) {
        result.push(field);
      }
    }
    return result;
  }
  return fields
    .filter((field) => field.id !== primaryFieldId && field.id !== groupFieldId)
    .slice(0, DEFAULT_CARD_FIELD_COUNT);
}

const DEFAULT_CARD_FIELD_COUNT = 2;

/** Case-insensitive collation for deterministic stale-column ordering. */
const TEXT_COLLATOR = new Intl.Collator("en-US", { sensitivity: "base" });

/**
 * Build the board's columns from the group field's options: one column per
 * option in option order (empty columns included — every option is a drop
 * target), then columns for stale option ids still stored on rows (labelled
 * by the raw id, mirroring `row-group`'s honest stale labels), and the
 * "No <field>" column for empty values ALWAYS last. Columns whose key is in
 * `hiddenColumnIds` split out into `hidden` (the "+ n hidden" chip counts
 * real columns only — stale hidden ids are ignored).
 */
export function buildBoardColumns(args: {
  field: BoardGroupField;
  hiddenColumnIds?: readonly string[];
  rows: readonly LocalDatabaseRow[];
}): { columns: BoardColumn[]; hidden: BoardColumn[] } {
  const { field, hiddenColumnIds, rows } = args;

  const buckets = new Map<string, LocalDatabaseRow[]>();
  for (const row of rows) {
    const key = groupKeyForRow(field, row.values[field.id]);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }

  const optionIds = new Set(field.options.map((option) => option.id));
  const all: BoardColumn[] = field.options.map((option) => ({
    key: option.id,
    label: option.name,
    color: option.color,
    rows: buckets.get(option.id) ?? [],
    value: option.id,
  }));

  const staleKeys = [...buckets.keys()]
    .filter((key) => key !== "" && !optionIds.has(key))
    .sort((a, b) => TEXT_COLLATOR.compare(a, b));
  for (const key of staleKeys) {
    all.push({
      key,
      label: key,
      rows: buckets.get(key) ?? [],
      value: key,
    });
  }

  all.push({
    key: "",
    label: `No ${field.name}`,
    rows: buckets.get("") ?? [],
    value: null,
  });

  if (!hiddenColumnIds || hiddenColumnIds.length === 0) {
    return { columns: all, hidden: [] };
  }
  const hiddenSet = new Set(hiddenColumnIds);
  return {
    columns: all.filter((column) => !hiddenSet.has(column.key)),
    hidden: all.filter((column) => hiddenSet.has(column.key)),
  };
}

/** Horizontal extent of one column, in viewport coordinates. */
export interface BoardColumnZone {
  key: string;
  left: number;
  right: number;
}

/** Vertical extent of one card, in viewport coordinates. */
export interface BoardCardRect {
  bottom: number;
  id: string;
  top: number;
}

/** Measured drop geometry for one drag frame, in column display order. */
export interface BoardDropZones {
  /** Ordered card rects per column key (render order within the column). */
  cardsByColumn: ReadonlyMap<string, readonly BoardCardRect[]>;
  columns: readonly BoardColumnZone[];
}

/**
 * Board drop target: `between` carries the neighbor pair for a manual
 * reorder within a column (`beforeCardId: null` = end of the column);
 * `column` targets the column as a whole (empty column, or reorder disabled
 * because the view is sorted) — the drop writes the group value only.
 */
export type BoardDropTarget =
  | {
      afterCardId: string | null;
      beforeCardId: string | null;
      columnKey: string;
      kind: "between";
    }
  | { columnKey: string; kind: "column" };

function nearestColumn(
  columns: readonly BoardColumnZone[],
  pointerX: number
): BoardColumnZone | null {
  let best: BoardColumnZone | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    if (pointerX >= column.left && pointerX < column.right) {
      return column;
    }
    const distance =
      pointerX < column.left ? column.left - pointerX : pointerX - column.right;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = column;
    }
  }
  return best;
}

/**
 * Resolve the drop target under the pointer: the containing column by X
 * (nearest column when the pointer sits in a gap), then the insertion slot
 * by comparing pointer Y against card midpoints — the dragged card itself is
 * excluded so its own rect never becomes a neighbor. `allowReorder: false`
 * (sorted views — the sort owns intra-column order) and empty columns
 * resolve to whole-column targets.
 */
export function resolveBoardDropTarget(args: {
  allowReorder: boolean;
  pointer: { x: number; y: number };
  sourceId: string;
  zones: BoardDropZones;
}): BoardDropTarget | null {
  const { allowReorder, pointer, sourceId, zones } = args;
  const column = nearestColumn(zones.columns, pointer.x);
  if (!column) {
    return null;
  }

  const cards = (zones.cardsByColumn.get(column.key) ?? []).filter(
    (card) => card.id !== sourceId
  );
  if (!allowReorder || cards.length === 0) {
    return { kind: "column", columnKey: column.key };
  }

  let index = 0;
  for (const card of cards) {
    if (pointer.y > (card.top + card.bottom) / 2) {
      index += 1;
    } else {
      break;
    }
  }
  return {
    kind: "between",
    columnKey: column.key,
    beforeCardId: cards[index]?.id ?? null,
    afterCardId: index > 0 ? (cards[index - 1]?.id ?? null) : null,
  };
}
