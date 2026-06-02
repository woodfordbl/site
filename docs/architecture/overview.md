# Architecture overview

## Stack

- TanStack Start + TanStack Router
- ShadCN on Base UI, Tabler icons, Tailwind v4
- TanStack DB (localStorage) for user edits
- Zod schemas in `src/lib/schemas/`
- Server pages in `content/pages/*.json`

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

## Request flow

1. Route loader calls `loadPage` (server JSON)
2. Client resolves user pages from localStorage if needed
3. `buildBlockTree(blocks)` from server JSON or local page document
4. `PageWorkspace` → `PageCanvas` → `BlockTreeNodeView`
5. Edits dispatch `CanvasCommand` → reducer → TanStack DB
