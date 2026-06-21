# Structural actions

Backspace/Delete in a field becomes structural via `resolveStructuralDeleteKey` in [`field-keydown.ts`](../../src/lib/editor/field-keydown.ts) (caret at start, or empty block); the keyboard priority chain (slash menu → modifier arrows → arrows → indent → markdown → Enter → structural delete) lives in [`editable-surface.tsx`](../../src/components/editor/editable-surface.tsx).

Priority order in `resolveStructuralAction` ([`resolve-structural-action.ts`](../../src/lib/canvas/resolve-structural-action.ts)):

0. `pageLink` or `divider` + Backspace/Delete → `row.delete` + focus adjacent row
1. Empty + indent > 0 → `indent.adjust` -1
2. Empty + previous sibling → `row.delete` + focus previous (list items stay in the list)
3. Empty + container child whose policy uses `onEmptyChildDelete: lift-out` → `block.liftAsText` (for list, first or sole empty item; sole item replaces the list row; indent preserved)
4. Empty + only child of a container that does not lift empty child delete → `container.unwrap`
5. Empty + top-level + previous row accepts merge → `block.mergeIntoPreviousCanvasRow`
6. Empty + top-level user row → `row.delete` + focus up (no-op when it is the sole top-level row)
7. Caret 0 + indent > 0 → `indent.adjust` -1
8. Caret 0 + previous sibling → `block.mergeTextIntoPreviousSibling`
9. Caret 0 + in container (not first-only merge) → `block.liftAsText`
10. Caret 0 + only child in container → `block.liftAsText`

Container merge and lift policy use [`block-container-config.ts`](../../src/lib/canvas/block-container-config.ts) and [`block-interactions.ts`](../../src/lib/canvas/block-interactions.ts) (list and checklist: empty Enter lifts out; empty Delete with a previous sibling deletes in place; first or sole empty item Delete lifts out; same-type child stays inside; disallowed conversions lift out).

Page sidebar duplicate/rename/delete do not go through this resolver; they use page commands and `persistPageMetadata` instead. Sidebar and canvas **drag reorder** use the [drag-and-drop toolkit](../architecture/drag-and-drop.md) (`resolve-drop-target`, `page.reposition`) — not `resolveStructuralAction`.

Structural commands that change document order persist `blockOrder` and bump page `updatedAt` in the same transaction as block rows; `createdAt` is unchanged.
