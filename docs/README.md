# Site architecture documentation

Start here for canvas, pages, and data-layer behavior.

## Index

- [Architecture overview](./architecture/overview.md)
- [Block model](./architecture/block-model.md) — `parentId`, list containers, indent
- [Canvas editor](./architecture/canvas-editor.md) — command bus, reducer, focus
- [Pages](./architecture/pages.md) — user pages, empty canvas, routing
- [Local-first persistence](./architecture/local-first-persistence.md) — server JSON vs local page documents, lazy seed, hash/revert
- [Author dev mode](./architecture/author-dev-mode.md) — save to `content/pages/*.json`
- [Block types](./architecture/block-types.md) — BlockSpec / ContainerSpec
- [BlockNote comparison](./architecture/blocknote-comparison.md)
- [Editor tracks](./architecture/editor-tracks.md)

## Reference

- [Canvas commands](./reference/canvas-commands.md)
- [Page commands](./reference/page-commands.md)
- [Structural actions](./reference/structural-actions.md)

## Contributing

- [Updating docs](./contributing/updating-docs.md) — architecture/reference markdown, `docs:check`, hooks
- [Inline API docs](./contributing/inline-api-docs.md) — colocated JSDoc on exported symbols
