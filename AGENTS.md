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

**Cursor hooks (local Agent Chat):** `afterFileEdit` runs `pnpm fix` and tracks manifest-mapped paths (and `docs/**/*.md` edits); `stop` runs docs checks when edits exceed **10 lines** or touch **major** paths from `docs/.doc-manifest.json` (`hookGate` + per-mapping `majorGlobs`) — **docs-sync** must add `majorGlobs` for new features. See [updating-docs.md](docs/contributing/updating-docs.md). Run full `pnpm docs:check` before merge. When changing exported APIs in `src/lib/**`, `src/db/queries/**`, or manifest-listed hooks, update colocated JSDoc in the same turn.

---

## Learned User Preferences

- Use **pnpm** for installs, scripts, and ShadCN CLI (`pnpm dlx shadcn@latest`), not npm.
- ShadCN on **Base UI** primitives (`shadcn init -b base`); **Tabler** icons (`iconLibrary: "tabler"`). OKLCH tokens: `--tertiary`/`--tertiary-foreground` hold the former accent fill; `--accent: var(--muted)` and `--selection: var(--muted)`. Button/tab labels use sentence case and `font-normal` (not uppercase/`font-medium`); active press is `scale-[0.98]` not translate-y; icon-button SVGs use `stroke-[1.5px]` via `buttonIconChildClassNames`; light-mode buttons get a subtle hover state on every variant; labeled icon buttons use `<Button><Icon> Text</Button>` (not icon-only sizing when text is present). `TabsList` defaults to the sliding **`indicator`** variant — pill (`default`) and line share the same animated indicator (surface styling only differs); motion uses `--ease-out-strong` at 200ms with `motion-reduce:transition-none`. `DropdownMenuSwitchItem` row click toggles (`closeOnClick={false}`). Do not override `Button` dimensions or icon `size-*` when `size` variants or parent selectors already handle sizing — use `className` for color/cursor only. Page icons and breadcrumb triggers use `Button`/`iconSlotClassName` from `button.tsx` — do not redefine icon sizes in `page-icon-display.tsx`. Breadcrumb ancestor/current triggers are plain `variant="ghost"` buttons only — no shared crumb sizing or padding class token; current-crumb title/icon edit popover stays compact (minimal padding; icon picker matches trigger at `icon-sm` + `ghost`, not larger `icon` + `outline`).
- When implementing an attached plan: do **not** edit the plan file; use existing todos (mark in progress) instead of recreating them. Net-new schema changes: clean break only — no migration or legacy fallback.
- **Vercel GitHub app** handles preview/production deploys; GitHub Actions runs quality gates only (no `VERCEL_TOKEN` deploy-from-Actions unless explicitly requested).
- **Mixed-canvas** UX: cookie SSR hints pick server-first on first visit vs local-first after any local edit (refresh must not flash icons or canvas content); `site-page-list-local` mirrors delete tombstones (`deletedAt`) so locally deleted server pages do not flash in the sidebar on reload; pre-ready client merge combines cookie preview + localStorage bootstrap via `mergeLocalPageSources`; server pages lazy-seed into `localPagesCollection` on first edit; user pages live in the same collection; shipped `content/pages/*.json` stays canonical for deploy; stale/conflict UI offers per-page and full reset to remote. See [docs/architecture/local-first-persistence.md](docs/architecture/local-first-persistence.md).
- **Canvas layout:** Site shell `bg-sidebar`; main panel is a `bg-background` inset (`md:rounded-xl`, border) with `PageHeader` breadcrumb; canvas scrolls inside the inset below the header; dev/stale footer actions sit bottom-left on the sidebar background (`size-xs` outline), stale controls left of Save/Reset; page main content uses `px-12 py-12` in `page-workspace`; top-level block text aligns with the page title text column (`pl-9` after the title's fixed `w-9`/`size-9` icon slot; view-mode `reserveGutterSpace` for SSR/hydration parity); left-aligned content with gutter extending left; plus + grab top-aligned with the first line of text (`text-muted-foreground`, not vertically centered on tall blocks); grab tooltip is two muted lines like gutter insert ("Click to select" / "Drag to move"); grip **`cursor-pointer` at rest**, **`cursor-grab` after press+movement threshold**, **`cursor-grabbing` during drag** (not always-on grab); `bg-selection` on `data-canvas-row-content` for selected blocks (include top spacing on the same node so the full block height highlights), `bg-primary` for reorder drop lines; no block shell hover/focus background; no trailing drop zone; drag ghost has no background and source stays full opacity; grab click (press and release) opens block menu and highlights the row; click-hold drag reorders without highlight or menu; block/structure **action menus**: block-type label at top, type-specific actions, separator, then Duplicate/Delete; **Search actions…** filter at top (auto-focus; flat filtered list while querying); block/canvas gutters reveal on **hover only** (not `focus-within` while typing), 300ms delay to appear, hide immediately on leave; list/checklist child rows show gutter only on the hovered item (parent list gutter stays hidden while hovering a sibling); column hover scopes block gutters to that column only (component-local Tailwind `group`/`peer`, not shared global tokens or `styles.css` additions).
- **Canvas editor fields:** `EditableSurface` uses native `<input>`/`<textarea>` (not ShadCN Input/Textarea — avoids `md:text-sm` overriding block typography); transparent, chrome-free (no background/focus ring), single-line default (`rows={1}`), `px-1` so the caret is not clipped; multiline uses `field-sizing-content`. Normal block text uses `text-foreground`; placeholders use `text-muted-foreground` (not body-muted copy or `/50` opacity). Placeholders: text blocks and quotes show placeholder only when focused and empty; empty headings always show muted "Heading 1/2/3" until content is entered.
- **Page icon / emoji pickers:** One composable picker built on **Base UI** primitives + **TanStack Virtual** with deferred/lazy data loading (TanStack Query); emoji and icon panels must match exactly (identical scroll area, search box, spacing, grid); reuse design-system `Button` (small ghost, default size) for glyph buttons, each with a tooltip showing the **capitalized** name and tuned delays (longer before it appears, higher when switching items); search uses the shared `InputGroup` with a Tabler search icon and placeholders "Search emojis"/"Search icons"; use Base UI `ScrollArea` (`components/ui/scroll-area.tsx`) with `.scroll-fade-y` driven by `--scroll-area-overflow-*` (fades only after scrolling, first row stays opaque at rest); no-results uses shadcn `Empty` at `min-h-[320px]` (same height as the virtualized grid); the page-icon trigger is a ghost button with a large icon placed left of the page title. Tabler glyph + emojibase data are synced into `public/` via scripts.
- **Canvas keyboard:** Enter splits at the caret (`row.split`); Shift+Enter adds a newline in multiline blocks; Backspace/Delete on an empty block removes the row and focuses the previous row; Delete/Backspace with multiple blocks selected removes all selected rows; Option+↑/↓ moves the focused row (`row.moveAdjacent`); Shift+↑/↓ extends block selection from the caret row (same anchor rules as Shift+click); inside columns, shift-range is scoped to siblings in the same column (nested row shells handle shift-click, not the outer columns shell). With the gutter block menu open, Option+↑/↓ and Shift+↑/↓ move/extend selection — do not navigate menu items.
- **Gutter insert:** Click insert after, Option-click insert before — always relative to the clicked row only; tooltips use muted ShadCN `Kbd` for shortcuts.
- **Slash menu:** Keep the active editor focused while filtering; typing filters, arrow keys navigate highlighted rows, Enter confirms; Escape dismisses without reopening while `/query` stays in the block; selecting a type converts in place and strips `/command` (no new row); closes immediately with no exit animation delay; menu body uses Base UI `ScrollArea` with edge fade (not raw `overflow-y-auto`). **2/3/4 columns** slash rows must call `columns.create` (never an empty `columns` shell) and focus the leftmost column `text`. **Table** slash row calls `table.create` (default 3×3) and focuses the first header/body cell. **Link To Page** opens a native submenu; focus moves into search when picking a page (Escape returns to root).
- **Bullet list UX:** Inline bullets only (plain text items — no headings or other block styles inside the list); Tab adjusts indent (levels 0–2); Enter on a non-empty item adds a sibling (at end/middle of text); Enter at caret 0 lifts the item out to a top-level text block (splits the list when needed) — e.g. Enter at end then Enter on the new empty item yields text; Enter on an empty item at any caret position also lifts out; Shift+Enter exits the list to a new block after; Turn into / slash / markdown conversion lifts the item out of the list at that canvas position; empty item Backspace/Delete with a previous sibling deletes in place and focuses the previous item at end; first or sole empty item Backspace/Delete lifts to text with indent preserved.

## Learned Workspace Facts

- **Stack:** TanStack Start + TanStack Router, ShadCN on Base UI (`style: base-nova`), Tabler icons, Tailwind v4, Nitro for Vercel SSR.
- **Repo:** GitHub `woodfordbl/site` (public); local workspace folder `personal-site`; `package.json` name is `site`.
- **Lint/format:** Ultracite + Biome (`pnpm check`, `pnpm fix`); see `.vscode/settings.json` and `.cursor/hooks.json` for editor/agent hooks.
- **CI:** `.github/workflows/ci.yml` runs `lint`, `typecheck`, and `build` on PRs and pushes to `main` (pnpm 10.22.0, Node 22).
- **Merge/production gates:** `main` requires `lint`, `typecheck`, and `build`; Vercel Deployment Checks block production alias until those same GitHub checks pass.
- **Data layer:** TanStack DB local-first; `localPagesCollection` holds page metadata including `blockOrder`; `localBlocksCollection` holds one row per block (`pageId`, `updatedAt`) in per-page localStorage shards (`site-local-blocks:<pageId>`); server pages lazy-seed on first edit with `serverBaselineHash` for stale detection; `buildBlockTree(blocks)` (in `src/lib/blocks/block-tree.ts`, with `reconcileRowTrees` structural sharing) for canvas rows; immediate block writes per keystroke through one collection transaction (`usePageCanvas`); persistence write failures surface via Sonner toasts (`reportPersistenceError`), not inline banners. Binary assets (media uploads) live in IndexedDB via **`idb-keyval`** (`db/assets/asset-store.ts`, store `site-assets`) keyed by **SHA-256 content hash** so duplicate/copy-pasted blocks share one blob; `asset-gc.ts` reclaims unreferenced assets and `use-asset-object-url` resolves object URLs.
- **UI layers:** `components/ui/` → `layout/` → `blocks/` → `canvas/` → `routes/`; collections and reactive queries in `db/`; pure block/tree logic in `lib/blocks/` (single-source per-type data in `lib/blocks/block-defs.ts`); Zod schemas in `lib/schemas/`; shared SSR-hint cookie helpers in `lib/cookies/`. DEV-only `/dev` route + `components/dev/component-showcase.tsx` preview design-system colors and components. Global native scrollbars match ScrollArea styling via `styles.css` + `NativeScrollbarEffect` in `AppProviders` — hidden at rest, visible on scroll/hover, widen 6px→10px (`.no-scrollbar` and ScrollArea viewports excluded).
- **Canvas editor:** Custom block registry in `components/blocks/registry.ts` + command bus (not BlockNote/Tiptap); block types include `callout`, `divider`, bullet/numbered `list`, `checklist`, `columns`/`column`, `table`/`tableRow`/`tableCell`, `media` (image/video/gif by URL or upload; hover toolbar positions from `object-contain` content bounds with the same 8px inset as resize handles), `embed` (URL bookmark, YouTube/Vimeo provider resolution via `lib/media/resolve-embed-provider.ts`), and `pageLink` (title + icon at `text-foreground`; underline alone uses `decoration-border`); block gutter menu lives in `components/canvas/block-gutter-menu/` with `BlockGutterMenuProvider` context + section components (Turn into, view options, row/table actions) — same hook/context pattern as `components/ui/`; per-gutter `DropdownMenu` (sidebar-style), not a hoisted canvas menu session — Base UI owns open/close lifecycle; `useCanvasRowActions` + `row-placement.ts` for gutter/drag/paste (insert at clicked row index ± 1, no chain walk); UI emits commands, reducer owns structure. Block selection via grab handle + `--selection`/`bg-selection`. Shared native HTML5 DnD toolkit in `lib/dnd/` + `components/dnd/` (zero-dep, headless prop-getters, rAF-batched pointer + rect cache, React drag overlay) powers sidebar page-list and canvas row/block reorder; domain drop resolvers stay surface-specific. See [docs/architecture/canvas-editor.md](docs/architecture/canvas-editor.md).
- **Canvas block mutations:** Prefer **in-place** effects (`persist`, `move`, `row.convert`) that keep the same block id when changing type, parent, or document position. Avoid **delete + insert/recreate** with the same id for lifts, Turn into, and list exit — it breaks TanStack DB upserts and drops editor focus. Use `planLiftContainerChildConversion` (`persist` → optional container `delete` → `move` → `focus`) for container child lift-out; reserve delete/insert for genuinely new rows only.
- **Lists & containers:** `list` (bullet or `variant: ordered`) and `checklist` containers with children via `parentId`; list indent on `block.indent`; checklist items are `checklistItem` rows with `props.checked` (ShadCN checkbox). `columns` is a nested container (2–4 `column` children, each holding arbitrary blocks); widths use flex-grow `props.width` via hover-only between-column resize zones (`use-column-resize.ts`, 300ms `hover-reveal` divider with `bg-selection` — not shadcn `Resizable`); no add/remove column controls in the UI. Deleting the sole block in a column dispatches `columns.removeColumn` (not `container.unwrap` while the block still exists); Enter in column children stays in-column (caret-0 lift policy excludes columns — split/sibling insert, not `liftAsText`). `lib/canvas/columns-layout.ts` planners (`planColumnsCreate`/`Unwrap`/`AddColumn`/`RemoveColumn`, `MIN_COLUMNS_COUNT`=2/`MAX`=4); dropping below 2 columns unwraps the container. **`table`** is a row-major grid (`table` → `tableRow` → `tableCell` text-only cells); `hasHeaderRow` + `hasHeaderColumn` + `columnWidths[]` on the table block; block-actions menu adds Fit to width plus Header row/column inline switches (not toggle buttons); cells render inline in `TableView` (no nested gutters); Tab/Enter navigate via `table.focusCell`; row reorder uses `row.move` on `tableRow` siblings (header row not draggable when `hasHeaderRow`); column reorder uses nested DnD + `table.reorderColumn` (keep the DnD wrapper outside `<table>` — never a `<div>` inside the table or header/body columns misalign); column-handle `:has()` reveal variants must be static literal class strings (not template-built indices) so Tailwind JIT emits CSS for every index up to `MAX_TABLE_COLUMNS`; add-row/add-column plus controls are full-width bottom / full-height right strips (reveal on direct table hover, last row/column hover, or hovering the add strip via `group/add-row-host`); gutter-style two-line tooltips, click adds one, drag scrubs trailing count at half-row/column threshold with `cursor-ns-resize`/`cursor-ew-resize` on hover (add-row tooltip centered below); structure handles mid-edge on row/column hover (any cell in axis, not while typing): `rounded-sm`, pointer/grab/grabbing cursor parity with block gutter; source handle `opacity-0` while dragging (grip stays on drag preview only); click opens start-aligned structure menu with full-row/column `border-accent` outline (clears when menu closes); click-hold drag reorders with one full-table-span `bg-primary` drop line per boundary (`TableStructureDropIndicators` — no half-axis highlight bands); drop hit rects merge full column height / full row width; horizontal-only column resize pins other widths and uses full-height `bg-selection` dividers (same hover-reveal pattern as columns); wide tables use edit-mode `-mx-12`/`w-[calc(100%+6rem)]` + symmetric `px-12`/`-mx-12` scroll padding so content (including the block gutter) scrolls to both panel edges without clipping handles — do not fork `components/ui/scroll-area.tsx` for table overflow; table selection chrome uses `border-accent`/`bg-accent`, not `--selection`. Planners in `lib/canvas/table-layout.ts` (`MIN_TABLE_COLUMNS`=2, `MAX`=10). See [docs/architecture/table-blocks.md](docs/architecture/table-blocks.md).
- **Pages:** Unified sidebar tree (shipped + user, no sections); collapsed edge-hover peek panel (`data-page-sidebar-hover-panel`) remaps `--sidebar-*` tokens to main `--background`/`--foreground`/`--accent` equivalents; page header breadcrumb — ancestor crumbs use dropdown submenus (siblings/children on hover); current page icon+title editable via popover; page list rows are full-width `SidebarMenuItem` + `SidebarMenuButton` at every depth (sidebar accent tokens, not custom `Button` variants — no `SidebarMenuSubButton`/`SidebarMenuSubItem`); `SidebarMenuSub` + `Collapsible` for nesting only, with border/margin/padding stripped (no left sub-rail indent); nested rows indent by depth (`pl-2` / `pl-5` / `pl-8` via `page-list-preview-depth.ts`, shared with drag ghost); active rows use accent bg/text but normal font weight (no `font-medium`); page icon/emoji; parent rows swap page icon ↔ expand chevron in the same left slot via the shared `.swap-conceal`/`.swap-reveal` hover-reveal primitive (see [docs/architecture/motion.md](docs/architecture/motion.md)); the row is a `data-reveal-group`, so the chevron and three-dot action reveal on row hover/`focus-within` (blur row after nav clears the sticky reveal), while pointer-events still gate on `group-hover/page-row`/`group-focus-visible/page-row`; chevron rotates when expanded and toggles expand without navigating; expand state in cookie; **New page** is the last `SidebarMenuItem` in the scrollable list (not a footer); `SidebarMenuAction` three-dot overflow inside `SidebarMenuItem` (`.hover-reveal` under the row's `data-reveal-group` shows the action on nested rows too, and keeps it visible on touch); right-click context menu with the same actions; header collapse is a single chevron (left when expanded, right when collapsed — no duplicate layout icon); desktop sidebar resizes 12–24rem via edge `PageSidebarRail` only (no visible resizable handle, no rail focus ring): **click** collapses when pinned / pins when collapsed; **click-hold drag** resizes; Cmd/Ctrl+B to collapse — zero width when collapsed, edge-hover overlay to peek; sidebar drag-drop reparents (drop onto a page nests it and appends a `pageLink` block) or reorders (drop between rows, including child→root), with home and server pages draggable, grab shown only on click-hold (~50ms) and the drag ghost aligned to the source row; `page.delete` cascades descendants, blocks home (`/`) and deleting the last page. **Routing:** shipped pages use metadata slug routes on `/` or `/$`; user-created pages (`serverBaselineHash: null`) use `/p/{slug}` (e.g. `/p/new-page`, `/p/work/notes` with deduping). Root splat URLs for user pages redirect to `/p/…`. Nesting via `parentId` + metadata `slug`; sidebar/pageLink use `resolvePageNavTarget`. Title rename (canvas + sidebar) persists title while typing with slug held fixed; renavigate/sync URL only on blur (never mid-edit, which 404s) and propagates via cross-tab sync; user pages keep stable `/p/…` until blur updates the path segment. Canvas keeps ≥1 empty top-level `text` row (normal block ids, no sentinel suffixes). `MAX_PAGE_DEPTH = 3`. See [docs/architecture/pages.md](docs/architecture/pages.md).
- **Author dev mode:** In `import.meta.env.DEV`, the canvas footer **Save to source** button writes edits to `content/pages/{slug}.json` for git deploy. See [docs/architecture/author-dev-mode.md](docs/architecture/author-dev-mode.md).
