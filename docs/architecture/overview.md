# Architecture overview

## Stack

- TanStack Start + TanStack Router
- ShadCN on Base UI, Tabler icons, Tailwind v4
- TanStack DB (localStorage) for user edits
- Zod schemas in `src/lib/schemas/`
- Server pages in `content/pages/**/*.json`, bundled at build time via `src/lib/content/page-store.server.ts` (`import.meta.glob`)

## Capability nesting

```
Pages (workspace, routing, create)
  └── Canvas (block rows, commands, editor)
        └── Blocks (BlockSpec / ContainerSpec)
```

## Folder layers

| Layer | Path |
|-------|------|
| UI primitives | `src/components/ui/` |
| Layout | `src/components/layout/` |
| Blocks | `src/components/blocks/` |
| Canvas | `src/components/canvas/` |
| Pages | `src/components/pages/` |
| Routes | `src/routes/` |
| Data | `src/db/` |
| Core logic | `src/lib/canvas/`, `src/lib/pages/` |

## Module placement

- `src/lib/*` — pure domain logic, grouped by folder (`blocks`, `canvas`, `pages`, `content`, `cookies`, `local-draft`, `schemas`, …); no React.
- `src/db/` — TanStack DB collections plus reactive queries; React hooks there are named `use-*` (e.g. `src/db/queries/use-page-canvas.ts`).
- `src/hooks/` — cross-cutting React hooks used by multiple capabilities.
- Components colocate UI-specific hooks next to the component that owns them (e.g. `src/components/blocks/types/media/use-media-resize.ts`).

## Request flow

1. Route loader calls `loadPage` (bundled server JSON)
2. Client resolves user pages from localStorage if needed
3. `buildBlockTree(blocks)` from server JSON or local page document
4. `PageWorkspace` → `PageCanvas` → `BlockTreeNode`
5. Edits dispatch `CanvasCommand` → reducer → TanStack DB

## Edit path

A keystroke flows: keydown → editable-surface handler chain (`src/components/editor/editable-surface.tsx`) → command dispatch → `canvasReducer` (`src/lib/canvas/reducer.ts`) plans effects → `applyCanvasEffects` (`src/lib/canvas/apply-effects.ts`) → `usePageCanvas` session + collection transaction (`src/db/queries/use-page-canvas.ts`, `block-collection-ops.ts`) → per-page localStorage shard (`src/db/collections/page-sharded-block-storage.ts`).
