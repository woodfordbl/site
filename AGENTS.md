# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm dlx ultracite fix`
- **Check for issues**: `pnpm dlx ultracite check`
- **Diagnose setup**: `pnpm dlx ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `pnpm dlx ultracite fix` before committing to ensure compliance.

---

## Project documentation

Canonical architecture and canvas rules: [docs/README.md](docs/README.md).

Before changing editor behavior, read:

- [docs/architecture/pages.md](docs/architecture/pages.md)
- [docs/architecture/canvas-editor.md](docs/architecture/canvas-editor.md)
- [docs/architecture/block-model.md](docs/architecture/block-model.md)
- [docs/reference/canvas-commands.md](docs/reference/canvas-commands.md)

Agents must keep docs in sync per [docs/contributing/updating-docs.md](docs/contributing/updating-docs.md) and [docs/contributing/inline-api-docs.md](docs/contributing/inline-api-docs.md). Run `pnpm docs:check` after canvas/pages changes.

**Cursor hooks (local Agent Chat):** `afterFileEdit` runs `pnpm fix` and tracks manifest-mapped paths; `stop` runs `pnpm docs:check` and may auto-continue with a prompt to delegate the **docs-sync** subagent (`.cursor/agents/docs-sync.md`). When changing exported APIs in `src/lib/**`, `src/db/queries/**`, or manifest-listed hooks, update colocated JSDoc in the same turn.

---

## Learned User Preferences

- Use **pnpm** for installs, scripts, and ShadCN CLI (`pnpm dlx shadcn@latest`), not npm.
- ShadCN on **Base UI** primitives (`shadcn init -b base`); **Tabler** icons (`iconLibrary: "tabler"`). Do not override `Button` dimensions or icon `size-*` when `size` variants or parent selectors already handle sizing — use `className` for color/cursor only.
- When implementing an attached plan: do **not** edit the plan file; use existing todos (mark in progress) instead of recreating them. Net-new schema changes: clean break only — no migration or legacy fallback.
- **Vercel GitHub app** handles preview/production deploys; GitHub Actions runs quality gates only (no `VERCEL_TOKEN` deploy-from-Actions unless explicitly requested).
- **Mixed-canvas** UX: server pages lazy-seed into `localPagesCollection` on first edit; user pages live in the same collection; shipped `content/pages/*.json` stays canonical for deploy. See [docs/architecture/local-first-persistence.md](docs/architecture/local-first-persistence.md).
- **Canvas layout:** No header/footer on canvas routes; left-aligned content with gutter extending left; plus + grab top-aligned with the first line of text (`text-muted-foreground`, not vertically centered on tall blocks); `--selection` for selected blocks and drop lines; no block shell hover/focus background; no trailing drop zone; drag ghost has no background and source stays full opacity; grab click (press and release) opens block menu and highlights the row; click-hold drag reorders without highlight or menu; block-actions menu closes immediately when focus leaves menu or grab; list/checklist child rows show gutter only on the hovered item (parent list gutter stays hidden while hovering a sibling).
- **Canvas editor fields:** `EditableSurface` uses native `<input>`/`<textarea>` (not ShadCN Input/Textarea — avoids `md:text-sm` overriding block typography); transparent, chrome-free (no background/focus ring), single-line default (`rows={1}`), `px-1` so the caret is not clipped; multiline uses `field-sizing-content`.
- **Block placeholders:** Text blocks and quotes show placeholder text only when focused and empty. Empty headings always show muted "Heading 1/2/3" until content is entered.
- **Canvas keyboard:** Enter splits at the caret (`row.split`); Shift+Enter adds a newline in multiline blocks; Backspace/Delete on an empty block removes the row; Option+↑/↓ moves the focused row (`row.moveAdjacent`); Shift+↑/↓ extends block selection from the caret row (same anchor rules as Shift+click). With the gutter block menu open, Option+↑/↓ and Shift+↑/↓ move/extend selection — do not navigate menu items.
- **Gutter insert:** Click insert after, Option-click insert before — always relative to the clicked row only; tooltips use muted ShadCN `Kbd` for shortcuts.
- **Slash menu:** Keep the active editor focused while filtering; typing filters, arrow keys navigate highlighted rows, Enter confirms; Escape dismisses without reopening while `/query` stays in the block; selecting a type converts in place and strips `/command` (no new row); closes immediately with no exit animation delay. **Link To Page** opens a native submenu; focus moves into search when picking a page (Escape returns to root).
- **Bullet list UX:** Inline bullets only (plain text items — no headings or other block styles inside the list); Tab adjusts indent (levels 0–2); Enter on a non-empty item adds a sibling (at end/middle of text); Enter at caret 0 lifts the item out to a top-level text block (splits the list when needed) — e.g. Enter at end then Enter on the new empty item yields text; Enter on an empty item at any caret position also lifts out; Shift+Enter exits the list to a new block after; Turn into / slash / markdown conversion lifts the item out of the list at that canvas position; empty item Backspace/Delete with a previous sibling deletes in place and focuses the previous item at end; first or sole empty item Backspace/Delete lifts to text with indent preserved.

## Learned Workspace Facts

- **Stack:** TanStack Start + TanStack Router, ShadCN on Base UI (`style: base-nova`), Tabler icons, Tailwind v4, Nitro for Vercel SSR.
- **Repo:** GitHub `woodfordbl/site` (public); local workspace folder `personal-site`; `package.json` name is `site`.
- **Lint/format:** Ultracite + Biome (`pnpm check`, `pnpm fix`); see `.vscode/settings.json` and `.cursor/hooks.json` for editor/agent hooks.
- **CI:** `.github/workflows/ci.yml` runs `lint`, `typecheck`, and `build` on PRs and pushes to `main` (pnpm 10.22.0, Node 22).
- **Merge/production gates:** `main` requires `lint`, `typecheck`, and `build`; Vercel Deployment Checks block production alias until those same GitHub checks pass.
- **Data layer:** TanStack DB local-first; `localPagesCollection` holds page metadata including `blockOrder`; `localBlocksCollection` holds one row per block (`pageId`, `updatedAt`) in per-page localStorage shards (`site-local-blocks:<pageId>`); server pages lazy-seed on first edit with `serverBaselineHash` for stale detection; `buildBlockTree(blocks)` for canvas rows; immediate block writes + focused-row draft overlay while typing (`usePageCanvas`).
- **UI layers:** `components/ui/` → `layout/` → `blocks/` → `canvas/` → `routes/`; collections and merge logic in `db/`; Zod schemas in `lib/schemas/`.
- **Canvas editor:** Custom block registry in `components/blocks/registry.ts` + command bus (not BlockNote/Tiptap); block types include `callout`, `divider`, bullet/numbered `list`, and `checklist` containers; `useCanvasRowActions` + `row-placement.ts` for gutter/drag/paste (insert at clicked row index ± 1, no chain walk); UI emits commands, reducer owns structure. Block selection via grab handle + `--selection`. See [docs/architecture/canvas-editor.md](docs/architecture/canvas-editor.md).
- **Canvas block mutations:** Prefer **in-place** effects (`persist`, `move`, `row.convert`) that keep the same block id when changing type, parent, or document position. Avoid **delete + insert/recreate** with the same id for lifts, Turn into, and list exit — it breaks TanStack DB upserts and drops editor focus. Use `planLiftContainerChildConversion` (`persist` → optional container `delete` → `move` → `focus`) for container child lift-out; reserve delete/insert for genuinely new rows only.
- **Lists & containers:** `list` (bullet or `variant: ordered`) and `checklist` containers with children via `parentId`; list indent on `block.indent`; checklist items are `checklistItem` rows with `props.checked` (ShadCN checkbox).
- **Pages:** Unified sidebar tree (shipped + user, no sections); ghost full-width rows (nested rows stay full sidebar width — indent via row `pl-*`, not wrapper shrink); page icon, chevron-on-hover expand, trash-on-hover delete, right-click duplicate/rename/delete; `page.delete` cascades descendants, blocks home (`/`) and deleting the last page. **Routing:** user-created pages (`serverBaselineHash: null`) at `/p/$pageId`; shipped + lazy-seeded edits keep slug routes (`/$`, `/`). Nesting via `parentId` + metadata `slug`; user child under server parent opens `/p/{childId}` while parent stays on slug URL; sidebar/pageLink use `resolvePageNavTarget`. Title rename syncs slug URL only for non-user-created pages. One-time migration renames shadowed user metadata slugs and redirects legacy slug bookmarks to `/p/id`. Canvas keeps ≥1 empty top-level `text` row (normal block ids, no sentinel suffixes). `MAX_PAGE_DEPTH = 3`. See [docs/architecture/pages.md](docs/architecture/pages.md).
- **Author dev mode:** In `import.meta.env.DEV`, the canvas footer **Save to source** button writes edits to `content/pages/{slug}.json` for git deploy. See [docs/architecture/author-dev-mode.md](docs/architecture/author-dev-mode.md).
