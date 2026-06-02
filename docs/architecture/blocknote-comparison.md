# BlockNote comparison

## What we borrow

| BlockNote | Ours |
|-----------|------|
| `blockContainer` + `blockGroup` | `parentId` + `buildBlockTree` |
| `BlockSpec` | `BlockSpec` / `ContainerSpec` |
| Keyboard chain (lift/merge) | `resolveStructuralAction` |
| Schema-driven slash | `BLOCK_SPECS` registry |

## What we skip

- `@blocknote/xl-*` (commercial/GPL multi-column, AI, exporters)
- ProseMirror as persistence source of truth
- Built-in Yjs collab (v1)

## Editor track

See [editor-tracks](./editor-tracks.md). v1 uses **Track A — custom** `EditableSurface` + command bus.

Reference: [BlockNote pm-nodes README](https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/src/pm-nodes/README.md)
