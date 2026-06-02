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

## Checklist

- Canvas / blocks → `canvas-editor.md`, `canvas-commands.md`, `block-model.md`
- Pages → `pages.md`, `page-commands.md`
- Structural resolver → `structural-actions.md`
- Author mode → `author-dev-mode.md`
- Persistence / hash → `local-first-persistence.md`
- Changed exports → colocated JSDoc per [inline-api-docs.md](./inline-api-docs.md)

Run `pnpm docs:check` before finishing a canvas or pages task.

## Automation (Cursor hooks)

Hooks live in `.cursor/hooks.json` (see [Cursor Hooks](https://cursor.com/docs/hooks)).

| Hook | Role |
|------|------|
| `sessionStart` | Clears `.cursor/hooks-state/docs-session.json` |
| `afterFileEdit` | `pnpm fix`; tracks manifest-mapped paths per edit |
| `stop` | Runs `pnpm docs:check`; may auto-send a follow-up to delegate **docs-sync** |

**Local Agent Chat only:** the `stop` hook is not wired for cloud agents yet. Cloud runs still get per-edit tracking; run `pnpm docs:check` manually.

**Matcher note:** `afterFileEdit` matchers filter tool types (`Write`), not file paths. Path filtering uses the manifest inside `scripts/docs-hook-track-edit.mjs`.

When the stop hook fires, use the **docs-sync** subagent (`.cursor/agents/docs-sync.md`) to update markdown and JSDoc, then confirm `pnpm docs:check` passes.
