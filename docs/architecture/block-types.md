# Block types

## Block vs BlockSpec

- **Block** — a runtime instance on the canvas (`id`, `type`, `props`, …), stored locally in `localBlocksCollection`. Editor invariants add normal empty `text` rows when needed (minimum block + trailing blank row); see [block-model](./block-model.md).
- **BlockSpec** — static registration for a **block type** in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts) (`BLOCK_SPECS`).

`BlockRenderer` looks up `BLOCK_SPECS[block.type]` and renders the registered components with `block.props`. Duplicating a whole page clones instances with new ids while preserving type and props shape (see [block-model](./block-model.md)).

## Type hierarchy

| Kind | Types | Spec shape |
|------|-------|------------|
| Leaf | `heading`, `text`, `quote`, `callout`, `checklistItem`, `pageLink`, `divider` | `View` + `Edit` |
| Container | `list`, `checklist` | `Container` + `container` behavior |

Pure types live in [`src/lib/canvas/block-spec.types.ts`](../../src/lib/canvas/block-spec.types.ts).

## BlockSpec fields

Each block type registers in `BLOCK_SPECS`:

- `label`, `slashAliases`, `icon`
- Slash menu rows are built centrally in `registry.ts` (`specToSlashMenuItems`, `HEADING_SLASH_MENU_ITEMS`, `LIST_SLASH_MENU_ITEMS`) gated by `behavior.capabilities.slashMenu`; `pageLink`, the `list` container, and `checklistItem` are not slash entries on the spec itself (checklist appears via the container spec's slash aliases)
- `createDefault()`
- `behavior.isEmpty`, `behavior.editStrategy`, `behavior.capabilities`
- `allowedParents`
- **Leaf:** `View`, `Edit` components
- **Container:** `Container` (lazy getter), `container` (`allowedChildTypes`, `defaultChildType`, `onEmptyChildEnter`, `onCaretStartChildEnter`, `onEmptyChildDelete`, `onDisallowedChildConversion`, `insertSiblingOnEnter`, `acceptEmptyMergeFromAfter`)

Container behavior config is shared via [`src/lib/canvas/block-container-config.ts`](../../src/lib/canvas/block-container-config.ts) (`BLOCK_CONTAINER_CONFIG` + helpers like `isAllowedChild`). Structural child behavior uses [`src/lib/canvas/block-interactions.ts`](../../src/lib/canvas/block-interactions.ts) and [`src/lib/canvas/container-child-conversion.ts`](../../src/lib/canvas/container-child-conversion.ts) (lift-out uses `persist` + `move`, not delete + recreate the same id). Container components load via [`container-loaders.ts`](../../src/components/blocks/container-loaders.ts) to avoid registry ↔ renderer import cycles. Row insert/move placement is type-agnostic and persists full document order via `blockOrder`; see [block-model](./block-model.md) and [canvas-editor](./canvas-editor.md#block-identity-on-structural-edits).

## File layout

```
src/components/blocks/
├── registry.ts              # SINGLE REGISTRATION — BLOCK_SPECS
├── block-renderer.tsx       # Dispatches View/Edit from registry
├── block-shell.tsx
└── types/{type}/
    ├── {type}-view.tsx
    └── {type}-edit.tsx      # list uses list-view.tsx as Container only
```

Only `registry.ts` imports every block component. Other code imports from `@/components/blocks/registry.ts`; shared container child chrome belongs in `container-children.tsx` so each container component only customizes markers, spacing, and wrapper UI.

## editStrategy

| Strategy | Example types | BlockRenderer keyboard wiring |
|----------|---------------|--------------------------------|
| `inline-text` | heading, text, quote, callout, checklistItem | Full text-field keyboard (Enter split, slash with editor-focused filtering and dismiss-without-reopen, indent, structural keys) |
| `inline-custom` | pageLink, divider | Custom focus/delete; page link navigates via `resolvePageNavTarget(pageId)`; divider uses Enter to insert text after |
| `composite` | (future) chart | Custom — config UI, minimal canvas keyboard |
| `container` | list, checklist | `allowedChildTypes`: list → `["text"]`; checklist → `["checklistItem"]`; child rows use inline-text keyboard; Turn into / slash convert lifts item out of container ([canvas-editor](./canvas-editor.md#list-items)) |

## Adding a block type

1. Zod schema in `block-props.ts` + union in `block.ts`
2. `types/{name}/{name}-view.tsx` and `{name}-edit.tsx` (or `Container` for containers)
3. Register in `components/blocks/registry.ts`
4. Reducer cases + tests (if structural behavior changes)
5. Update `docs/reference/canvas-commands.md`
6. Run `pnpm docs:check`

No changes to `block-renderer.tsx` or `block-tree-node.tsx` for leaf blocks.

Local block rows are stored per page in `localBlocksCollection` — see [local-first-persistence](./local-first-persistence.md) and [block-model](./block-model.md).
