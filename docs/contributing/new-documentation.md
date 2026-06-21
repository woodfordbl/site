# Creating new documentation

Use this when a feature adds **new** code areas, commands, or UX that does not fit cleanly into existing architecture/reference pages. The **docs-sync** subagent follows this guide when the manifest has no mapping or when behavior deserves its own doc.

## Decide: extend vs new page

| Situation | Action |
|-----------|--------|
| Behavior fits an existing capability (pages, canvas, blocks, persistence) | Extend the mapped architecture doc + reference commands doc; do not add a parallel page |
| New cross-cutting subsystem (new `src/lib/{area}/` tree, new command bus, new route family) | Add architecture doc + optional reference doc |
| New block type only | Extend [block-types](../architecture/block-types.md) and [canvas-commands](../reference/canvas-commands.md); no new architecture file unless the type introduces a new interaction model |
| New page command or sidebar behavior | Extend [pages](../architecture/pages.md) and [page-commands](../reference/page-commands.md) |
| Author / export / dev-only workflow | Extend [author-dev-mode](../architecture/author-dev-mode.md) |

When unsure, prefer **one richer existing doc** over many thin pages.

## File placement

| Doc kind | Path | Contents |
|----------|------|----------|
| Architecture | `docs/architecture/{topic}.md` | UX, data flow, invariants, tables, links to `src/` paths |
| Reference | `docs/reference/{topic}-commands.md` or `{topic}.md` | Command/effect tables, field meanings, short examples |
| Index only | `docs/README.md` | One bullet under Architecture or Reference |

Do not add docs under `content/` — shipped page JSON is product content, not system docs.

## Architecture page template

```markdown
# <Capability> capability

One paragraph: what it is and how it nests in [docs index](../README.md).

## <Primary concept>

| Concern | Mechanism |
|---------|-----------|
| ... | [`page-icon.ts`](../../src/lib/pages/page-icon.ts) |

## <UX or rules>

Tables and bullet rules agents and humans can scan.

## Related

- [Pages](../architecture/pages.md)
- [Page commands](../reference/page-commands.md)
```

Match tone and depth of [pages](../architecture/pages.md) and [canvas-editor](../architecture/canvas-editor.md): behavior first, repo paths in tables, minimal prose.

## Reference page template

```markdown
# <Topic> commands

One line relating to canvas or page commands if applicable.

| Command | Meaning |
|---------|---------|
| `area.action` | ... |

Effects: `area.persist`, `navigate`, … with links to `src/lib/{module}` implementations.

## Related

- [Architecture — Pages](../architecture/pages.md)
```

Keep command names aligned with reducers and `use*Dispatch` exports.

## Wire into automation

After creating files:

1. **Manifest** — add a row to `docs/.doc-manifest.json`:
   - `globs`: every code path that should keep the doc fresh (directories with `/**`, specific hooks, components)
   - `docs`: architecture + reference paths you created or own
   - `majorGlobs`: command bus / reducer / dispatch / schema entry files for this feature (always trigger the docs stop hook, even for small diffs)
2. **Hook gate** — global defaults live under `hookGate` in the same file:
   - `majorBasenames`: shared filenames (`reducer.ts`, `commands.ts`, `use-page-dispatch.ts`, …)
   - `majorExactPaths`: single files (`docs/.doc-manifest.json`, …)
   - Prefer **`majorGlobs` on the feature’s mapping** for area-specific files; only add to `hookGate` when the basename is shared across capabilities
3. **Index** — add bullets to `docs/README.md` under Architecture or Reference
4. **Cross-links** — from [docs index](../README.md) or parent capability doc if this is a nested concern
5. **JSDoc** — `@see docs/architecture/{topic}.md` on new exported APIs ([inline-api-docs](./inline-api-docs.md))
6. **Verify** — `node scripts/docs-manifest-lookup.mjs --path <changed-file>` then `pnpm docs:check`

## docs-sync responsibilities for net-new docs

When `pnpm docs:sync-brief` lists **unmapped structural paths**:

1. Read the git diff for those paths and infer the capability name.
2. If extending existing docs is enough, update those files only.
3. If a new page is warranted, create architecture (+ reference if there are commands), update manifest and README, cross-link from related docs.
4. Do not leave new code unlisted in the manifest — otherwise hooks will not enforce freshness on later edits.
5. Register **`majorGlobs`** on that mapping so command/reducer/dispatch edits always run the docs hook (see [updating-docs](./updating-docs.md#automation-cursor-hooks)).
