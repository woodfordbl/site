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
