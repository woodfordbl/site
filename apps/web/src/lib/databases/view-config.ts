import type { DatabaseField, DatabaseView } from "@/lib/schemas/database.ts";

/**
 * Pure per-view table configuration resolvers: which columns render, in what
 * order, which are pinned, and per-column wrap. All id lists in view config
 * are resolved against the live field schema — stale ids drop out silently.
 */

function visibleFields(
  fields: readonly DatabaseField[],
  view: DatabaseView
): DatabaseField[] {
  const visibleIds = view.visibleFieldIds;
  if (!visibleIds) {
    return [...fields];
  }
  return fields.filter((field) => visibleIds.includes(field.id));
}

/**
 * Resolve the view's column display order: `config.columnOrder` first (ids
 * resolved against the field schema, unknown ids dropped), then any
 * remaining fields in schema order. Fields hidden via `visibleFieldIds`
 * are excluded.
 */
export function resolveColumnOrder(
  fields: readonly DatabaseField[],
  view: DatabaseView
): DatabaseField[] {
  const visible = visibleFields(fields, view);
  const columnOrder = view.config.columnOrder;
  if (!columnOrder || columnOrder.length === 0) {
    return visible;
  }
  const byId: Record<string, DatabaseField> = {};
  for (const field of visible) {
    byId[field.id] = field;
  }
  const ordered: DatabaseField[] = [];
  const used = new Set<string>();
  for (const fieldId of columnOrder) {
    const field = byId[fieldId];
    if (field && !used.has(fieldId)) {
      ordered.push(field);
      used.add(fieldId);
    }
  }
  for (const field of visible) {
    if (!used.has(field.id)) {
      ordered.push(field);
    }
  }
  return ordered;
}

/**
 * Resolve the view's pinned (frozen) columns in pin order. Unknown ids drop
 * out; fields hidden via `visibleFieldIds` are never pinned.
 */
export function resolvePinnedFields(
  fields: readonly DatabaseField[],
  view: DatabaseView
): DatabaseField[] {
  const pinnedIds = view.config.pinnedFieldIds;
  if (!pinnedIds || pinnedIds.length === 0) {
    return [];
  }
  const visible = visibleFields(fields, view);
  const byId: Record<string, DatabaseField> = {};
  for (const field of visible) {
    byId[field.id] = field;
  }
  const pinned: DatabaseField[] = [];
  for (const fieldId of pinnedIds) {
    const field = byId[fieldId];
    if (field) {
      pinned.push(field);
    }
  }
  return pinned;
}

/**
 * Whether a column wraps its content (vs the single-line truncate default)
 * in this view.
 */
export function isFieldWrapped(view: DatabaseView, fieldId: string): boolean {
  return view.config.wrapFieldIds?.includes(fieldId) ?? false;
}
