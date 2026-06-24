# Polish Plan — Audit Synthesis & Phased Implementation

> Produced 2026-06-12 from a six-agent audit (data model, block architecture, canvas
> editor, React performance, SSR/SEO/cookies, design polish, docs/organization).
> Each phase is independently shippable as a PR, ordered by leverage and dependency.

## What's already good (preserve these)

- Command bus is real: every edit path flows dispatch → reducer → effects → persistence; zero direct collection writes in block components.
- `blockSchema` discriminated union with per-type props; compiler-enforced `BLOCK_SPECS` registry; declarative container policy.
- DnD toolkit: external store + `useSyncExternalStore` selectors with `Object.is` bailout, rAF-batched pointer, rect cache at drag start. **This is the template for fixing the editor context.**
- `.overlay-popover-surface` in `styles.css` — correct easing tokens, asymmetric enter/exit, reduced-motion fallback. **This is the template for unifying motion.**
- Slash menu / block-actions menu correctly render with zero animation (keyboard-frequency UI).
- Hydration primitives (`useIsClient`/`useIsMobile` via `useSyncExternalStore` with server snapshots); no `setMounted` flicker pattern anywhere.
- Docs are ~90% accurate, honest about unwired code, with real tooling (`docs-check`, manifest, hooks).
- Pickers: lazy chunks, idle/hover preload, virtualization, shared tooltip root.

---

## Phase 0 — Correctness hotfixes (small PR, do first)

1. **[CRITICAL] Rules-of-hooks violation** — `src/components/pages/page-workspace.tsx:78` early-returns before `useState` at `:89`. Hoist the `useState` above the `isLocallyDeletedPage` return. React throws/corrupts state at the exact moment a server page is locally deleted.
2. **Stop swallowing persistence errors** — `src/db/queries/block-collection-ops.ts:62,291,338,361` (`tx.commit().catch(() => undefined)`) and uncaught `storage.setItem` in `page-sharded-block-storage.ts:54`. Centralize commit error handling; on `QuotaExceededError` surface a persistent "storage full — edits not saving" banner; `console.error` everything else. Don't mark the page dirty after a failed commit.
3. **Confirm destructive Revert** — `stale-banner.tsx` + `page-canvas-footer.tsx:132-137`: "Revert" deletes local edits with no confirmation while adjacent "Reset" has a dialog. Add explanatory copy ("This page was updated on the site since you edited it") and route Revert through the same confirm dialog.
4. **Fix multi-row copy/paste flattening containers** — `cloneBlocksForPaste` (`src/lib/canvas/clipboard.ts:19-29`) keeps stale `parentId`s and doesn't remap ids; non-structured paste force-flattens (`row-placement.ts:73-77`). Cmd+A/C/V on a page with lists produces orphaned `checklistItem`/`column` blocks. Serialize subtrees with `cloneRowSubtreeBlocks` and paste via the structured path with id remap at paste time.
5. **Quarantine unparseable blocks instead of dropping them** — `read-block-shard.ts:30-35` skips blocks that fail `localBlockSchema`; the next shard write then permanently deletes the raw data. Copy failed entries to a quarantine key (`site-local-blocks-quarantine:<pageId>`) and log in dev.

## Phase 1 — Block definitions: single source of truth (foundation for everything else)

Goal: adding a leaf block type = 3 files (schema entry, view+edit components, registry entry). Today it's ~10 edit sites; containers are ~12+.

1. **Create a pure-data `block-defs` layer** (e.g. `src/lib/blocks/block-defs.ts`, no component imports). Each entry: props schema, `defaultProps`, `isEmpty`, `getText`/`withText`, layout hints. Derive from it:
   - `blockTypeSchema` and the `blockSchema` dis◊criminated union (`src/lib/schemas/block.ts`)
   - `createEmptyBlock` / `getTextFromBlock` / `withBlockText` / `defaultPropsByType` (collapse the four switches in `create-block.ts`)
   - `isBlockEmpty` (`is-block-empty.ts`)
   - Delete the duplicated `blockPropsSchema` union in `block-props.ts:91-108` (unused, pure drift liability).
2. **Make `createEmptyBlock` generic** — `createEmptyBlock<T extends BlockType>(type: T): BlockFor<T>` — deletes all 13 `as BlockFor<...>` casts in `registry.ts`.
3. **One container-type constant** — `CONTAINER_BLOCK_TYPES = [...] as const`; derive `ContainerBlockType`, `isContainerBlockType`, `isLeafBlockType`, `isContainerBlock`, `isContainerType` from it (currently 5 hardcoded copies across 4 files).
4. **Make `BLOCK_CONTAINER_CONFIG` a complete `Record<ContainerBlockType, ContainerDefinition>`** — removes the four inline duplicate-definition fallbacks in `registry.ts:155-164,257-266,287-296,317-326`.
5. **Enforce the container props contract** — add `convertRowId` to `BlockContainerProps.onSlash` (currently a silent 3-arg drift in every container); make ListView/ChecklistView/ColumnsView take `BlockContainerProps` directly (ColumnContainer proves it works). Deletes ~80 lines of duplicate interfaces.
6. **Layout hints on the spec** — `layout: { shellSpacingClass?, gutterAlignClass? }` replaces the per-type special cases in `block-renderer.tsx:71-77`, `block-spacing.ts`, `block-tree-node.tsx:106-111`.
7. **Dead-code prune** (the codebase is disciplined enough that dead parts mislead):
   - `allowedParents` on every spec (zero readers) — wire into drop/conversion validation or delete
   - `mergeBlocksOnSync` (unwired; latent bug at :67), `resolveDocumentOrderIds`, `sortLocalBlocksByPageOrder`, `isContainerBlock` (if not derived per #3)
   - `keymaps/` pipeline (`runKeymapPipeline` never called) — fold Backspace/Delete into the editable-surface chain or make the chain use the pipeline; don't keep a fake abstraction
   - `focus.clear` no-op command, `author.*` reserved commands + producer-less `author.save` effect
   - duplicate `handleCanvasKeyDown` (`use-canvas-editor.ts:375-400` vs `page-canvas-editor.tsx:67-92` — keep one with an injectable pre-action hook)
   - `BlockViewProps.className` (never passed), `placeholderVisibility: "when-unfocused"` (zero usages), dead `textareaRef`s in quote/callout edits, `columnsRowId` return
   - `scripts/tmp-validate-icons.mjs`
8. **Fix the lib/db layering inversion** — `buildBlockTree`/`findRowById`/`CanvasRow` live in `src/db/queries/merge-blocks.ts` (misleading name, wrong layer; pure `lib/blocks` code imports *up* into `db/queries`). Move to `src/lib/blocks/block-tree.ts`; keep `db/queries` for collection-touching code only.
9. **Normalize `parentId`** — schema currently allows both `null` and `undefined`; normalize to `null` at the schema/write boundary, drop the scattered `?? null`.

## Phase 2 — Typing hot path & re-render architecture

Goal: a keystroke re-renders the edited row only. Currently: 2 render passes × O(n²) work × every context consumer.

1. **Decide the draft-overlay question first** — it's keyed to `focus?.rowId` (the *pending* focus request, cleared once applied), so it almost never engages; every keystroke writes through to the sharded localStorage collection. Either:
   - **(recommended)** make it real: key to actual DOM focus, keep keystrokes in the overlay, debounce collection writes on idle/blur — also fixes "TanStack stringifies the entire collection per keystroke", or
   - delete the machinery and the doc claim. One source of truth either way.
2. **Split the 30-member `CanvasEditorContext`** into:
   - a stable actions context (dispatch, inserts, moves — identity-stable via the `configRef` pattern already used in `dnd-surface.tsx:89-98`), and
   - a volatile state store (rows/selection/focus/clipboard) read via selectors — reuse the `drag-store` external-store pattern. Rows subscribe to `isRowSelected(rowId)` / `focus.rowId === rowId` slices.
3. **Structural sharing in `buildBlockTree`** — reuse prior row objects for unchanged blocks so memoized rows actually bail out; then `React.memo` on `CanvasRowView`/`BlockTreeNode`.
4. **Kill the O(n²)** — `text-edit.tsx:18-28` runs `findRowContext` (O(n) tree scan) per text block per render just to learn it's a list item. Pass `parentType` down from `ContainerChildren` as a prop. Also build a `Map<parentId, Block[]>` in `buildBlockTree` instead of per-scope filters.
5. **Memoize `hashPageBlocks(serverPage.blocks)`** (`use-page-canvas.ts:85`, `page-workspace.tsx:85`) — full recursive stringify of all server blocks per render today.
6. **Hoist the slash menu to a single canvas-level controller** — every row currently instantiates `useCanvasSlashMenu` (which mounts `usePageDispatch` → collection subscription + query per row). Only one menu can be open. Rows keep a thin `onSlash` forwarder. Also: split `CanvasMenuContext` so slash-session churn doesn't re-render every `BlockGutter`; hoist `getSlashMenuItems()` to a module constant.
7. **Collapse slash prop drilling** — 10-12 `slash*` props threaded through 7 layers (BlockTreeNode → Container → ContainerChildren → BlockRenderer → BlockEdit → LeafBlockEdit → EditableSurface); falls out of #6 via context. Also collapse the `BlockEdit` → `LeafBlockEdit` passthrough in `block-renderer.tsx`.
8. **Extract the write orchestration out of `usePageCanvas`** (620 lines, five transaction refs, two parallel write paths). Extend `CanvasPageSession` (or wrap in `PageWriteSession`) to own begin/apply/commit; the hook becomes a thin React adapter; the three overlapping diff implementations in `block-collection-ops.ts` shrink to one. Unit-test the session directly.
9. **Reframe `canvasReducer` as `planCanvasCommand(rows, command): CanvasEffect[]`** — it never produces new state and generates UUIDs; drop the fake `ReducerResult.state` and unused `serverBlocks`, inject an id factory for replayable tests. Add a dev assertion (or branded `NewBlock` type) that an inserted id was never deleted in the same effect batch — the persist-vs-recreate invariant currently lives only in markdown.
10. **Smaller wins:** rAF-batch + drag-start width capture in `use-column-resize` (mirror `use-media-resize`, add missing `pointercancel`, commit both columns in one batched dispatch); extract shared `usePointerDrag` used by both resize hooks; shared `useInlineCustomBlockKeys` for the four copy-pasted ~40-line keydown handlers (divider/page-link/media/embed); throttle `refreshRects` on drag-scroll to rAF; snapshot columns-layout rects at drag start instead of `querySelectorAll` per dragover (`resolve-drop-target.ts:198-246`); `content-visibility: auto` + `contain-intrinsic-size` on row shells for long documents; lazy-import devtools behind the DEV branch; visible focus target for media/embed blocks (replace the invisible `sr-only` focus-proxy button with a `data-focused` ring on the frame).

## Phase 3 — SSR, SEO, cookies

1. **Per-page `head()`** on `/` and `/$`: title from loaded page, description derived from first text blocks, og/twitter tags, canonical. The only `head()` today is the static root one.
2. **Server-side 404s** — `$.tsx` loader catches all errors into `{kind:"pending"}` → 200 soft-404s for any garbage URL. When the slug isn't in the server catalog **and** the request carries no local-draft/preview cookies, `throw notFound()` server-side. Reserve pending for cookie-flagged "might be local" slugs.
3. **Verify and fix runtime file reads on Vercel** — `load-page.ts:13`, `list-pages.ts:40`, `read-tabler-glyphs.server.ts:13-16` read from `process.cwd()` at request time with bare `nitro()` config; the function bundle likely won't include them. Best fix doubles as a win: **prerender shipped routes** (catalog is fully known at build) and/or declare `content/` + icon JSON as Nitro `serverAssets`.
4. **One cookie module** — replace six private copies of read/write with a typed `defineSsrCookie(name, codec, { readOnServer, maxBytes })` factory. Inventory: `site-local-dirty`, `site-page-list-local`, `site-page-list-expanded`, `site-page-sidebar-width`, `site-page-sidebar-pin`, `site-page-favorites`.
5. **Fix the preview-cookie overflow** — `site-page-list-local` mirrors all local page metadata as URL-encoded JSON; silently exceeds the ~4KB cap at ~10-20 pages and permanently breaks the anti-flash contract. Trim to what SSR paint needs (id/slug/title/icon/parentId), cap to top-N by `updatedAt`, check serialized size before write, degrade gracefully.
6. **Read `site-page-list-expanded` during SSR** — the cookie exists but `page-list.tsx:137-139,353` renders the static tree with an empty set (even active-page ancestors), guaranteeing a collapse→expand layout shift. Wire it through root `beforeLoad` like sidebar prefs; apply `requiredAncestorIds` in the static shell.
7. **Stop SSR-ing blank content for dirty pages** — `page-canvas.tsx:25-30` returns `null` on server when a local draft exists → returning visitors (including the owner) see an empty body until hydration. Render the server baseline (layout-stable, crawler-equivalent) and let the editor swap in local blocks; same for the title. Extend the sidebar's "render best-known state, reconcile after hydrate" strategy to the canvas.
8. **`/p/$` polish** — currently SSRs literally `null` outside `SiteShell` (blank document flash). Wrap pending state in `SiteShell` + skeleton; add `robots: noindex` meta and `Disallow: /p/` in robots.txt.
9. **SEO extras**: build-time `sitemap.xml` from `listPages`; JSON-LD `Person`/`WebSite`; dedupe `loadPageListLocalPreview()` (called in both `beforeLoad` and `loader` of `__root.tsx`) and parallelize the root loader; consider caching `getSidebarTablerGlyphs` across client navs.
10. **Asset GC for visitors** — `sweepOrphanAssets` only runs from the dev-only save button; adopted-site visitors accumulate orphaned IndexedDB blobs forever. Run on idle after collections sync, with a grace period for recently-put assets.

## Phase 4 — Motion & interaction polish

1. **Unify on the transition system.** Migrate tooltip, dialog, context-menu, sheet off tw-animate keyframes onto `.overlay-popover-surface`-style utilities (add `.overlay-modal-surface` center-origin ~200ms enter/150ms exit, `.overlay-sheet-surface` with `--ease-drawer`). Fixes: non-interruptibility, missing reduced-motion on half the overlays, dead Radix selectors in `tooltip.tsx:53` (Base UI never emits `data-[state=delayed-open]`), and the dropdown-vs-context-menu inconsistency (identical surfaces, different motion).
2. **Tooltip system**: provider default delay > 0 (today `delay = 0`); `[data-instant] { transition-duration: 0ms }` so adjacent tooltips skip animation, not just delay; centralize the five magic delays (0/100/300/400/700) into exported constants.
3. **Duration tokens** beside the easing tokens in `styles.css` (`--duration-press/reveal/overlay-in/overlay-out/drawer-in/drawer-out`); `page-sidebar-hover-reveal.tsx`'s local constants read from them.
4. ✅ **Done** — **One `.hover-reveal` utility** (plus `.swap-reveal`/`.swap-conceal` for the icon↔chevron swap) on a `data-reveal-group` convention, `--ease-out-strong`, `@media (hover:none)` always-visible, `focus-within` always-on, reduced-motion fallback. Applied to: sidebar row actions, chevron/icon swap, media toolbar/handles, table structure handles, table add-row/column controls, column dividers; the canvas gutter keeps its JS pointer reveal but gets touch handling (grip only). Reveal duration/delay are **overridable per-instance props** (`--reveal-duration`/`--reveal-delay`, defaults in `components/ui/hover-reveal.ts`) rather than `:root` tokens — table handles pass `0ms`, column dividers keep the 300ms delay. See [docs/architecture/motion.md](docs/architecture/motion.md).
5. **Excise `transition-all`** from `button.tsx:7`, `badge.tsx:8`, `sidebar.tsx:275`; fix `sheet.tsx:54` (`ease-in-out` symmetric → ease-out, exit faster); sidebar width animation `ease-linear` → `--ease-out-strong` (or transform-based); give `ResizeHandle` the standard focus-visible ring.
6. **Drag previews via transform** — `page-list-drag-preview.tsx:31-33` (and the canvas overlay path) reposition with `left/top` per pointer event; switch to `translate3d`.
7. **Touch**: gate decorative hover transforms (`media-video-player.tsx:94`) behind `(hover:hover) and (pointer:fine)`.
8. Optional micro-polish: 100ms placeholder opacity fade in `editable-surface`; modal duration 100ms → 200ms.

## Phase 5 — Docs, organization, guardrails

1. **Fix the 9 drift items**: `UserSlugPageClient`→`PendingSlugPageClient` (pages.md, canvas-editor.md), `BlockTreeNodeView`→`BlockTreeNode` (overview.md), `normalizeEditablePageBlocks` location (pages.md), `SidebarMenuSubButton` claims contradicting AGENTS.md (pages.md, page-commands.md), focus-application attribution (canvas-editor.md:41), stale `replacePageBlocks` intro (canvas-commands.md:3), `editor-tracks.md` decision record never updated (15 block types shipped, DnD shipped), block-types file-layout diagram, the inert draft-overlay claim (canvas-editor.md:31), `hasAnyLocalDrafts` dead prop + stale doc (local-first-persistence.md:71), the overstated "only re-serializes that page's blocks" claim (:46).
2. **Close manifest blind spots** — `registry.ts`, all of `components/blocks/**`, `lib/media/**`, `lib/editor/**`, `editable-surface.tsx`, `lib/dom/**`, schemas, `routes/**`, and the 6 hooks the globs miss. Fail full `docs:check` on unmapped structural paths (logic already exists in `docs-sync-brief`).
3. **New docs**: media/embed subsystem (10 modules, no architecture doc); the edit-path diagram (keydown → field-keydown → command → planner → effects → session → collection ops → shard) — the system's most important flow has no diagram; cookie/SSR inventory table; hooks placement rule.
4. **Organization**: pick one hooks convention (domain folders `src/hooks/{canvas,pages,media,shared}/` or consistent colocation) — currently three competing conventions and the manifest globs already miss files; split `db/queries` pure logic from React hooks (falls out of Phase 1 #8 and Phase 2 #8); fold `lib/dom` (media-only) into `lib/media`; rename mismatched test files.
5. **CI gates**: add `pnpm test` and full `pnpm docs:check` to CI (currently lint/typecheck/build only — the entire docs apparatus is enforced solely by local Cursor hooks). Improve `docs-check`: git-diff-based staleness instead of mtime; extend ref-check to verify inline-code symbols exist in linked files (would have caught most drift found above).
6. **Test the riskiest persistence code**: integration test of real `localStorageCollectionOptions` against `createMemoryStorage` + the shard adapter; `block-shard-storage-events` bridging; `sweepOrphanAssets`; the extracted `PageWriteSession` (Phase 2 #8).
7. **Document the concurrency contract** — whole-`blockOrder` LWW per page, known-lossy cross-tab races on structural edits. If multi-device sync is ever planned, that's the moment to move to fractional keys; until then, delete the vestigial `ORDER_STEP`/`sortOrder` remnants.

---

## Suggested PR sequence

| PR | Phase | Size | Risk |
|----|-------|------|------|
| 1 | Phase 0 hotfixes | S | Low — isolated fixes, add tests for paste + quarantine |
| 2 | Phase 1 block-defs + dead-code prune | M | Medium — wide but mechanical; exhaustive `never` checks + existing tests protect |
| 3 | Phase 2 context split + memoization + slash hoist | L | Highest — needs the draft-overlay decision up front; verify typing/focus/slash flows manually |
| 4 | Phase 2 write-session extraction + planner rename | M | Medium — pure refactor with new unit tests |
| 5 | Phase 3 SSR/SEO/cookies | M | Medium — verify prod file reads on a preview deploy first |
| 6 | Phase 4 motion unification | S-M | Low — visual review pass |
| 7 | Phase 5 docs + CI | S-M | Low |
