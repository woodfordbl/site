# Block types

## Block vs BlockSpec

- **Block** — a runtime instance on the canvas (`id`, `type`, `props`, …), stored locally in `localBlocksCollection`. Editor invariants add normal empty `text` rows when needed (minimum block + trailing blank row); see [block-model](./block-model.md).
- **BlockDef** — per-type data definition in [`src/lib/blocks/block-defs.ts`](../../src/lib/blocks/block-defs.ts) (`BLOCK_DEFS`): `defaultProps`, `isEmpty`, `hasPrimaryText`. `createEmptyBlock` (generic: `createEmptyBlock<T>(type): BlockFor<T>`), `getTextFromBlock`, `withBlockText` ([`create-block.ts`](../../src/lib/blocks/create-block.ts)), and `isBlockEmpty` ([`is-block-empty.ts`](../../src/lib/blocks/is-block-empty.ts)) all derive from these entries — no per-type switches.
- **BlockSpec** — static registration for a **block type** in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts) (`BLOCK_SPECS`): components + slash metadata.

`BlockRenderer` looks up `BLOCK_SPECS[block.type]` and renders the registered components with `block.props`. Duplicating a whole page clones instances with new ids while preserving type and props shape (see [block-model](./block-model.md)).

## Type hierarchy

| Kind | Types | Spec shape |
|------|-------|------------|
| Leaf | `heading`, `text`, `quote`, `callout`, `code`, `checklistItem`, `pageLink`, `divider`, `media`, `embed`, `database`, `tableCell` | `View` + `Edit` |
| Container | `list`, `checklist`, `columns`, `column`, `tabs`, `tab`, `table`, `tableRow`, `toggleHeading` | `Container` + `container` behavior (`column`, `tab`, and `toggleHeading` are generic-scope containers) |

`toggleHeading` is the one container that also carries primary text (`props.level`, `props.text`, optional `props.collapsed`). Because `ContainerBlockSpec` has no leaf `Edit`/`View`, its editable title lives inside the `Container` component ([`toggle-heading-view.tsx`](../../src/components/blocks/types/toggle-heading/toggle-heading-view.tsx)) — it dispatches `row.update` for the title and reads/writes `props.collapsed` through the heading-collapse context. Collapsing hides only its own children. Plain `heading` stays a leaf and is never collapsible.

`CONTAINER_BLOCK_TYPES`, `ContainerBlockType` / `LeafBlockType`, the `isContainerBlockType` / `isLeafBlockType` guards, and `BlockFor` / `PropsFor` live in [`src/lib/blocks/block-defs.ts`](../../src/lib/blocks/block-defs.ts); spec shapes in [`src/lib/canvas/block-spec.types.ts`](../../src/lib/canvas/block-spec.types.ts).

## BlockSpec fields

Each block type registers in `BLOCK_SPECS`:

- `label`, `slashAliases`, `icon`
- Slash menu rows are built centrally in `registry.ts` (`specToSlashMenuItems`): multi-variant blocks declare `slashItems` on the spec (heading levels, list variants, column counts, table dimensions); other specs derive one entry from `label` + `slashAliases`, gated by `behavior.capabilities.slashMenu` (`pageLink`, `checklistItem`, and `tableRow` opt out; checklist appears via the container spec's slash aliases)
- `createDefault()`
- `behavior.editStrategy`, `behavior.capabilities` (emptiness lives on `BLOCK_DEFS`, not the spec)
- **Leaf:** `View`, `Edit` components
- **Container:** `Container` (lazy getter), `container` (`allowedChildTypes`, `defaultChildType`, `onEmptyChildEnter`, `onCaretStartChildEnter`, `onEmptyChildDelete`, `onDisallowedChildConversion`, `insertSiblingOnEnter`, `acceptEmptyMergeFromAfter`)

Container behavior config is shared via [`src/lib/canvas/block-container-config.ts`](../../src/lib/canvas/block-container-config.ts) (`BLOCK_CONTAINER_CONFIG` — a complete `Record<ContainerBlockType, ContainerDefinition>` — plus helpers like `isAllowedChild`). Structural child behavior uses [`src/lib/canvas/block-interactions.ts`](../../src/lib/canvas/block-interactions.ts) and [`src/lib/canvas/container-child-conversion.ts`](../../src/lib/canvas/container-child-conversion.ts) (lift-out uses `persist` + `move`, not delete + recreate the same id). Container components load via [`container-loaders.ts`](../../src/components/blocks/container-loaders.ts) to avoid registry ↔ renderer import cycles. Row insert/move placement is type-agnostic and persists full document order via `blockOrder`; see [block-model](./block-model.md) and [canvas-editor](./canvas-editor.md#block-identity-on-structural-edits).

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

The media source primitives are not block-only: the asset store, [`useAssetObjectUrl`](../../src/hooks/use-asset-object-url.ts) / `resolveMediaDisplayUrl`, [`infer-media-kind.ts`](../../src/lib/media/infer-media-kind.ts), the `LinkUploadTabs` / `SourceLinkPanel` / `SourceUploadPanel` picker UI, the overlay hover toolbar pattern, and the copy/download helpers in [`media-actions.ts`](../../src/lib/media/media-actions.ts) are all reused by the non-block [page cover](./pages.md#page-cover) (which adds an Unsplash search source + CDN sizing in [`unsplash.ts`](../../src/lib/media/unsplash.ts), and a responsive dialog/drawer picker with infinite-scroll search).

## editStrategy

| Strategy | Example types | BlockRenderer keyboard wiring |
|----------|---------------|--------------------------------|
| `inline-text` | heading, text, quote, callout, checklistItem | Full text-field keyboard (Enter split, slash with editor-focused filtering and dismiss-without-reopen, indent, structural keys) |
| `inline-custom` | pageLink, divider, media, embed, code, database | Custom focus/delete via shared [`useInlineCustomBlockKeys`](../../src/hooks/use-inline-custom-block-keys.ts) (except **code**, see below); media/embed focus a visible wrapper (focus ring), not an sr-only button; page link navigates via `resolvePageNavTarget(pageId)`; `pageLinkShowsExternalIcon` shows `IconArrowUpRight` only for **Link To Page** (`variant: linked`) and legacy inferred external targets — not for slash **New Page** child links (`variant: child` or target `parentId ===` current canvas page); divider uses Enter to insert text after; **media** empty state uses shared [`PlaceholderTrigger`](../../src/components/ui/placeholder-trigger.tsx) + popover with Link \| Upload tabs ([`LinkUploadTabs`](../../src/components/ui/link-upload-tabs.tsx), IndexedDB-backed local files or external URL); media blocks are also created by pasting image/video files onto the canvas ([`paste-media.ts`](../../src/lib/media/paste-media.ts) — stored as IndexedDB assets, same as uploads); configured media gets hover toolbar (View / Download / Copy / Copy link) and edit-mode left/right resize handles persisting `props.widthPercent` (25–100); **embed** empty state uses the same placeholder trigger + link-only popover ([`SourceLinkPanel`](../../src/components/ui/source-link-panel.tsx)); configured embed accepts a URL — provider iframe, direct image, or server-unfurled OG bookmark preview (`resolveEmbedDisplay`); optional editable caption via block menu **Caption** (`showCaption` + `caption`, placeholder "Embed Caption") and menu actions **Replace** / **Open in browser** / **Copy link**; **database** is a leaf reference (`{databaseId, viewId?, hideTitle?}` — `hideTitle` hides the title row per placement) to a workspace database — the empty state's placeholder trigger creates-and-links a default database, linked blocks render its table grid ([databases](./databases.md)), and the edit wrapper forwards structural keys only when the wrapper itself is the event target so grid-cell keystrokes never delete the block; **code** renders a [`react-simple-code-editor`](https://github.com/react-simple-code-editor/react-simple-code-editor) overlay (transparent textarea over a Shiki-highlighted `<pre>`) with live dual-theme highlighting via [`src/lib/code/highlighter.ts`](../../src/lib/code/highlighter.ts) (lazy `import("shiki")`, `github-light`/`github-dark`; light color baked, dark swapped under `.dark` by the `.code-shiki` rules in `src/styles.css`) and an inline top-right language picker over [`CODE_LANGUAGES`](../../src/lib/code/code-languages.ts) (`props.language`). It does **not** use `useInlineCustomBlockKeys` — arrows/Backspace stay with the textarea, escaping the block only at the first/last line (`handleBlockArrowKeyDown`) or from an empty/caret-start state (`resolveStructuralDeleteKey`); the editor itself handles Tab (insert spaces) and Enter (newline — never splits the row) |
| `composite` | (future) chart | Custom — config UI, minimal canvas keyboard |
| `container` | list, checklist, columns, column, tabs, tab, table, tableRow | list → `["text"]`; checklist → `["checklistItem"]`; columns → `["column"]`; column → `*` (full canvas rows, no lift-out); tabs → `["tab"]`; tab → `*` (full canvas rows, no lift-out); table → `["tableRow"]`; tableRow → `["tableCell"]`. `columns` renders via [`ColumnsView`](../../src/components/blocks/types/columns/columns-view.tsx) (`data-columns-layout`, between-column resize, column-scoped block gutters on hover); column children use [`BlockTreeNode`](../../src/components/canvas/block-tree-node.tsx). `tabs` renders via [`TabsView`](../../src/components/blocks/types/tabs/tabs-view.tsx) on the native [Base UI tabs](../../src/components/ui/tabs.tsx): a `TabsList` of triggers (label = `tab.props.label`) plus the active tab's panel; edit mode adds a `+` control and a per-tab rename/delete menu, and persists the author's selected tab as `tabs.props.defaultTabId` (readers toggle locally without persisting). `table` renders via [`TableView`](../../src/components/blocks/types/table/table-view.tsx) (cells inline — no nested gutters; row/column structure handles with `:has()` column reveal and accent selection borders; trailing plus controls with click/drag scrub). Resizable widths: `column.props.width` (columns) and `table.props.columnWidths` (table, px). Slash: **2/3/4 columns** via `columns.create`; **Tabs** via `tabs.create` (default 2); **Table** via `table.create` (default 3×3). See [table-blocks](./table-blocks.md). |

## Adding a block type

1. Zod props schema in `src/lib/schemas/block-props.ts` + `blockSchema` union entry in `src/lib/schemas/block.ts`
2. `BLOCK_DEFS` entry in `src/lib/blocks/block-defs.ts` (`defaultProps`, `isEmpty`, optional `hasPrimaryText`)
3. `types/{name}/{name}-view.tsx` and `{name}-edit.tsx` (or `Container` for containers) + `BLOCK_SPECS` entry in `src/components/blocks/registry.ts`

Special cases when needed: gutter alignment / shell spacing in [`src/lib/blocks/block-spacing.ts`](../../src/lib/blocks/block-spacing.ts); containers also add to `CONTAINER_BLOCK_TYPES` (`block-defs.ts`) and `BLOCK_CONTAINER_CONFIG`; reducer cases + tests if structural behavior changes; primary-text leaf blocks that should be convertible add their type to `canTurnIntoBlock` / `turnIntoValueFromBlock` in [`block-gutter-menu-config.ts`](../../src/components/canvas/block-gutter-menu/block-gutter-menu-config.ts) (as `code` does) and to the `countWordsInBlock` switch in [`page-word-count.ts`](../../src/lib/pages/page-word-count.ts). Update `docs/reference/canvas-commands.md` and run `pnpm docs:check`.

No changes to `block-renderer.tsx`, `block-tree-node.tsx`, `create-block.ts`, or `is-block-empty.ts` for leaf blocks.

Local block rows are stored per page in `localBlocksCollection` — see [local-first-persistence](./local-first-persistence.md) and [block-model](./block-model.md).
