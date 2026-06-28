# Site settings

Site-wide preferences live on **`/settings`** routes inside the normal app shell ([`SiteSettingsLayout`](../../src/components/settings/site-settings-layout.tsx)). Page-level font/text-size settings stay in [`PageHeaderMenu`](../../src/components/pages/page-header-menu.tsx); the **global text-size default** lives here in Appearance and pages inherit it unless they set a per-page override.

## Trigger and layout

- [`SiteSettingsTrigger`](../../src/components/settings/site-settings-trigger.tsx) — ghost `IconSettings` button in the footer lane below the inset panel (sidebar background, not inside the main card). Navigates to `/settings/appearance` with `returnTo` and `pageId` search params.
- [`SiteSettingsLayout`](../../src/components/settings/site-settings-layout.tsx) — full [`SiteShell`](../../src/components/layout/site-shell.tsx) with the same [`PageSidebarChromeProvider`](../../src/components/pages/page-sidebar-chrome.tsx) resizable sidebar chrome as pages; only the sidebar slot (`SiteSettingsSidebar`) and main inset differ. Mobile keeps list/detail navigation without the page sidebar sheet.
- Mobile: `/settings` shows the nav list; section routes show the panel with **← Settings** back to the list. Desktop redirects `/settings` → `/settings/appearance` and keeps nav + panel visible.
- Settings sidebar top row: **Back to app** as a full-width [`SidebarMenuButton`](../../src/components/ui/sidebar.tsx) that shares the row with [`SidebarPinAction`](../../src/components/pages/sidebar-pin-action.tsx) only while the sidebar is collapsed (hover peek), then Preferences/Workspace groups. Panel rows use [`SettingsItemCard`](../../src/components/settings/settings-item-card.tsx) (`Item` + `ItemActions` controls).

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/settings` | [`settings.index.tsx`](../../src/routes/settings.index.tsx) | Mobile nav index; desktop redirects to default section |
| `/settings/$section` | [`settings.$section.tsx`](../../src/routes/settings.$section.tsx) | Section panel via [`SiteSettingsSectionContent`](../../src/components/settings/site-settings-section-content.tsx) |

Search params ([`settings-search.ts`](../../src/lib/settings/settings-search.ts)): `returnTo` (pathname), `pageId` (for development actions).

## Sections (v1)

| Section | Panel | Notes |
|---------|-------|-------|
| Appearance | [`AppearancePanel`](../../src/components/settings/panels/appearance-panel.tsx) | Interface theme dropdown + **Text size** (Small / Default / Large) — the site-wide default page text size (`SettingsItemField` + `SettingsItemSelect`) |
| Keyboard shortcuts | [`KeyboardShortcutsPanel`](../../src/components/settings/panels/keyboard-shortcuts-panel.tsx) | Rebindable rows from the [`keyboard-commands.ts`](../../src/lib/settings/keyboard-commands.ts) registry (single source of truth); user overrides persisted in TanStack DB (`localKeybindingsCollection`) via [`use-keybindings.ts`](../../src/lib/settings/use-keybindings.ts) |
| Analytics | [`AnalyticsPanel`](../../src/components/settings/panels/analytics-panel.tsx) | Greyscale charts (`palette="grey"`) from IndexedDB activity log |
| Backup | [`BackupPanel`](../../src/components/settings/panels/backup-panel.tsx) | Export the full local workspace to `.zip` or import an archive (**Replace** clears local state first; **Merge** overlays by page id) via [`useWorkspaceArchive`](../../src/hooks/use-workspace-archive.ts) — see [local-first-persistence — Workspace backup](./local-first-persistence.md#workspace-backup) |
| Development | [`DevelopmentPanel`](../../src/components/settings/panels/development-panel.tsx) | Save all, reset, refresh — shown only when [`usePageCanvasFooterActions`](../../src/hooks/use-page-canvas-footer-actions.ts) reports `visible` |

Dev/sync actions were removed from [`PageCanvasFooter`](../../src/components/canvas/page-canvas-footer.tsx) (footer strip removed from workspace) and from the header menu.

## Appearance / theme / text size

- Schema: [`site-appearance.ts`](../../src/lib/schemas/site-appearance.ts) (`theme`: `light` \| `dark` \| `system`; `textScale`: `small` \| `default` \| `large`).
- Cookie: `site-appearance` via [`site-appearance-cookie.ts`](../../src/lib/appearance/site-appearance-cookie.ts) (carries the whole appearance object).
- SSR: [`loadSiteAppearance`](../../src/lib/appearance/load-site-appearance.ts) in root `beforeLoad`; `html.dark` class and `html[data-page-text-scale]` seeded from [`readSiteAppearanceFromRequest`](../../src/lib/appearance/read-site-appearance.server.ts) (no flash).
- Client: [`ThemeProvider`](../../src/components/layout/theme-provider.tsx) applies `document.documentElement.classList` (theme) and `dataset.pageTextScale` (text size), and listens to `prefers-color-scheme` when theme is `system`.
- The `data-page-text-scale` attribute sets the `--page-text-scale` multiplier that each block's `font-size: calc(<rem> * var(--page-text-scale))` reads (`styles.css`); per-page overrides set the same attribute on the page content wrapper and win via the cascade. (The multiplier must be read directly in `font-size`, not via an intermediate token declared on `:root`, or descendant overrides are ignored.)

## Analytics

IndexedDB store [`page-activity-store.ts`](../../src/db/activity/page-activity-store.ts) records per-page events ([`PageActivityEvent`](../../src/lib/pages/page-activity-events.ts)). [`readAllPageActivityEvents`](../../src/db/activity/page-activity-store.ts) merges across pages (cap `SITE_ACTIVITY_EVENT_CAP` = 2000); aggregators in [`page-activity-analytics.ts`](../../src/lib/pages/page-activity-analytics.ts); [`useSiteActivityAnalytics`](../../src/hooks/use-site-activity-analytics.ts) feeds Recharts panels. Charts use `palette="grey"` on [`ChartContainer`](../../src/components/ui/chart.tsx).

## Phase 2 (not shipped)

- **Colors** — accent presets, global chart palette default.
- **Sidebar** — default width, pin state, tree expansion reset.
