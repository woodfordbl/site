# Updating documentation

When you change code, update matching docs and run `pnpm docs:check`. The check validates doc freshness (code mtime vs doc mtime) and that markdown links and inline repo paths still resolve to real files.

## Two tiers

| Tier | Where | Validated by |
|------|--------|--------------|
| Architecture / reference | `docs/architecture/`, `docs/reference/` | `pnpm docs:check` |
| Inline API (JSDoc) | Exported symbols in shared `src/lib/**`, `src/db/queries/**`, hooks in manifest | Convention; see [inline-api-docs.md](./inline-api-docs.md) |

## Mappings

See `docs/.doc-manifest.json` for glob → doc file mappings.

Resolve paths from the repo root:

```bash
node scripts/docs-manifest-lookup.mjs --path src/lib/canvas/reducer.ts
```

## Net-new documentation

When a feature does not fit existing pages, follow [new-documentation.md](./new-documentation.md) (templates, manifest, README). Run **`pnpm docs:sync-brief`** before delegating **docs-sync** — it lists mapped docs, unmapped structural paths, and suggested new doc targets.

## Checklist

- Canvas / blocks → `canvas-editor.md`, `canvas-commands.md`, `block-model.md`
- Drag-and-drop (canvas + sidebar) → `drag-and-drop.md`, plus `canvas-editor.md` / `pages.md` UX sections
- Pages → `pages.md`, `page-commands.md`
- Structural resolver → `structural-actions.md`
- Author mode → `author-dev-mode.md`
- Persistence / hash → `local-first-persistence.md`
- Changed exports → colocated JSDoc per [inline-api-docs.md](./inline-api-docs.md)

Run `pnpm docs:check` before finishing a canvas or pages task.

### Scoped check (modified files only)

Pass repo-relative paths to validate only manifest rows and docs touched by those files (used by the Cursor `stop` hook):

```bash
pnpm docs:check --files src/lib/pages/page-icon.ts
pnpm docs:check --files src/lib/canvas/reducer.ts,docs/architecture/canvas-editor.md
pnpm docs:check -- --files src/hooks/use-page-dispatch.ts
```

`DOCS_CHECK_FILES` (comma-separated) is also supported for scripts. With no paths, `docs:check` runs the full repo scan (use before merge).

## Automation (Cursor hooks)

Hooks live in `.cursor/hooks.json` (see [Cursor Hooks](https://cursor.com/docs/hooks)).

| Hook | Role |
|------|------|
| `sessionStart` | Clears `.cursor/hooks-state/docs-session.json` |
| `afterFileEdit` | `pnpm fix`; tracks manifest-mapped paths per edit |
| `stop` | Runs scoped `pnpm docs:check --files …` only when session edits meet the **line threshold** (default 10 added+deleted lines) or touch a **major** structural file (`reducer.ts`, `commands.ts`, manifest, etc.); may delegate **docs-sync** with `docs:sync-brief` |

Set `DOCS_HOOK_MIN_LINES=0` to always run on any tracked edit; raise the number to be stricter.

**Major paths** are declared in `docs/.doc-manifest.json`:

- `hookGate.majorBasenames` / `hookGate.majorExactPaths` — global (e.g. `reducer.ts`, manifest file)
- `majorGlobs` on a mapping row — per-feature command/reducer/dispatch files

**docs-sync** must add `majorGlobs` when introducing a new manifest mapping so small edits to the command bus still trigger documentation checks.

**Local Agent Chat only:** the `stop` hook is not wired for cloud agents yet. Cloud runs still get per-edit tracking; run `pnpm docs:check` manually.

**Matcher note:** `afterFileEdit` matchers filter tool types (`Write`), not file paths. Path filtering uses the manifest inside `scripts/docs-hook-track-edit.mjs`.

When the stop hook fires, use the **docs-sync** subagent (`.cursor/agents/docs-sync.md`). It receives a **`pnpm docs:sync-brief`** output in the follow-up message, may **create** new docs per [new-documentation.md](./new-documentation.md), then confirm full `pnpm docs:check` passes.
