# Site architecture documentation

Start here for canvas, pages, and data-layer behavior.

## Index

- [Architecture overview](./architecture/overview.md)
- [Block model](./architecture/block-model.md) — `parentId`, list containers, indent
- [Canvas editor](./architecture/canvas-editor.md) — command bus, reducer, focus
- [Drag-and-drop](./architecture/drag-and-drop.md) — shared HTML5 DnD toolkit (canvas + sidebar)
- [Pages](./architecture/pages.md) — user pages, empty canvas, routing
- [Site settings](./architecture/site-settings.md) — `/settings` shell, theme, analytics, dev actions
- [Local-first persistence](./architecture/local-first-persistence.md) — server JSON vs local page documents, lazy seed, hash/revert
- [Author dev mode](./architecture/author-dev-mode.md) — save to `content/pages/*.json`
- [Block types](./architecture/block-types.md) — BlockSpec / ContainerSpec; how-to: [Adding a block type](./architecture/block-types.md#adding-a-block-type)
- [Table blocks](./architecture/table-blocks.md) — grid model, keyboard, row/column DnD
- [Databases](./architecture/databases.md) — typed fields, views, sharded rows, table grid, filter bar
- [Formula language](./architecture/formula-language.md) — v2 engine: tokenize → parse → check → evaluate, id-canonical refs, read-time overlay
- [Haptics](./architecture/haptics.md) — semantic moments, device support, when (not) to buzz
- [BlockNote comparison](./architecture/blocknote-comparison.md)
- [Editor tracks](./architecture/editor-tracks.md)

## Reference

- [Canvas commands](./reference/canvas-commands.md)
- [Page commands](./reference/page-commands.md)
- [Structural actions](./reference/structural-actions.md)

## Contributing

- [Updating docs](./contributing/updating-docs.md) — architecture/reference markdown, `docs:check`, hooks
- [New documentation](./contributing/new-documentation.md) — when to add pages, templates, manifest wiring
- [Inline API docs](./contributing/inline-api-docs.md) — colocated JSDoc on exported symbols
