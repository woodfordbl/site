# Editor tracks

## Decision (v1): Track A — Custom

After spike, **custom `EditableSurface` + command bus** wins because:

- TanStack DB collections remain authoritative (no PM adapter)
- Minimal chrome matches product (transparent fields, gutter insert)
- Scope is 4–5 block types + list container

## Tracks considered

| Track | Packages | Status |
|-------|----------|--------|
| A — Custom | None | **Selected** |
| B — BlockNote core | `@blocknote/core`, `@blocknote/react` | Deferred |
| C — Tiptap | `@tiptap/core`, `@tiptap/react` | Deferred |

## Revisit Track B/C when

- Drag-drop reorder is required
- Rich inline marks need PM
- Adapter cost is justified by editor UX savings

## Hard no

- `@blocknote/xl-*` packages

## Outcome

Track A scaled past the original scope without revisiting B/C:

- 13 block types in [`src/lib/schemas/block.ts`](../../src/lib/schemas/block.ts) (vs the 4–5 scoped above)
- Drag-drop reorder shipped as a custom HTML5 toolkit ([`src/lib/dnd/`](../../src/lib/dnd/) + [`src/components/dnd/`](../../src/components/dnd/)) — see [drag-and-drop](./drag-and-drop.md) — no PM adapter needed
- The registry + command-bus architecture held unchanged
