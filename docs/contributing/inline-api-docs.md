# Inline API documentation (colocated JSDoc)

Colocated docs complement architecture markdown in `docs/`. They power IDE hovers and give agents context when reading a single file.

## Two tiers

| Tier | Location | Purpose |
|------|----------|---------|
| System | `docs/architecture/`, `docs/reference/` | Cross-file behavior, commands, UX |
| Inline API | `/** */` above **exported** symbols in shared `src/` | Contract for one export |

See [updating-docs.md](./updating-docs.md) for markdown sync and [../.doc-manifest.json](../.doc-manifest.json) for code → doc bindings.

## When JSDoc is required

Add or update a block comment when you **create or change** an exported symbol that other modules import, in:

- `src/lib/canvas/`, `src/lib/pages/`, `src/lib/blocks/`, and block schema modules under `src/lib/schemas/` (e.g. `block.ts`)
- `src/db/queries/`
- Cross-cutting hooks under `src/hooks/` listed in `docs/.doc-manifest.json` (canvas, page, slash, block-field helpers)

## When to skip

- Presentational components (`*-view.tsx`, `components/ui/`)
- Route files and tests
- Private helpers, unless behavior is non-obvious

## Format

Place TSDoc **immediately above** the export:

```ts
/**
 * Applies canvas commands to block rows. Prefer in-place persist/move over delete+insert with the same id.
 * @see docs/architecture/canvas-editor.md
 */
export function applyEffects(...) { ... }
```

- **One-line** summary is enough for simple exports.
- Use `@param`, `@returns`, or `@example` when types alone are unclear (effect planners, command helpers).
- Optional **file-level** comment at the top of entry modules (`commands.ts`, `reducer.ts`, `page-block-mutations.ts`) pointing at the matching architecture doc.

Keep full UX specs in architecture docs; JSDoc should not duplicate `canvas-editor.md`.

## Agents and automation

- Update JSDoc in the same turn as export changes.
- The **docs-sync** subagent refreshes both markdown and JSDoc after structural edits.
- `pnpm docs:check` does not validate JSDoc yet (convention + review only).
