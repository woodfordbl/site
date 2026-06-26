# Site settings

Site-wide preferences live on **`/settings`** routes inside the normal app shell ([`SiteSettingsLayout`](../../src/components/settings/site-settings-layout.tsx)). Page-level font/small-text settings stay in [`PageHeaderMenu`](../../src/components/pages/page-header-menu.tsx).

## Trigger and layout

- [`SiteSettingsTrigger`](../../src/components/settings/site-settings-trigger.tsx) — ghost `IconSettings` button in the footer lane below the inset panel (sidebar background, not inside the main card). Navigates to `/settings/appearance` with `returnTo` and `pageId` search params.
- [`SiteSettingsLayout`](../../src/components/settings/site-settings-layout.tsx) — full [`SiteShell`](../../src/components/layout/site-shell.tsx) with the same [`PageSidebarChromeProvider`](../../src/components/pages/page-sidebar-chrome.tsx) resizable sidebar chrome as pages; only the sidebar slot (`SiteSettingsSidebar`) and main inset differ. Mobile keeps list/detail navigation without the page sidebar sheet.
- Mobile: `/settings` shows the nav list; section routes show the panel with **← Settings** back to the list. Desktop redirects `/settings` → `/settings/appearance` and keeps nav + panel visible.
- Settings sidebar uses the same [`Sidebar`](../../src/components/ui/sidebar.tsx) primitives as the page list (`SidebarHeader`, `SidebarMenuButton`, `SidebarGroup`, etc.). **Back to app** is the first `SidebarMenuItem`. Panel rows use [`SettingsItemCard`](../../src/components/settings/settings-item-card.tsx) (`Item` + `ItemActions` controls).

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/settings` | [`settings.index.tsx`](../../src/routes/settings.index.tsx) | Mobile nav index; desktop redirects to default section |
| `/settings/$section` | [`settings.$section.tsx`](../../src/routes/settings.$section.tsx) | Section panel via [`SiteSettingsSectionContent`](../../src/components/settings/site-settings-section-content.tsx) |

Search params ([`settings-search.ts`](../../src/lib/settings/settings-search.ts)): `returnTo` (pathname), `pageId` (for development actions).

## Sections (v1)

| Section | Panel | Notes |
|---------|-------|-------|
| Appearance | [`AppearancePanel`](../../src/components/settings/panels/appearance-panel.tsx) | Interface theme dropdown (`SettingsItemField` + `SettingsItemSelect`) |
| Keyboard shortcuts | [`KeyboardShortcutsPanel`](../../src/components/settings/panels/keyboard-shortcuts-panel.tsx) | Data from [`keyboard-shortcuts.ts`](../../src/lib/settings/keyboard-shortcuts.ts) |
| Analytics | [`AnalyticsPanel`](../../src/components/settings/panels/analytics-panel.tsx) | Greyscale charts (`palette="grey"`) from IndexedDB activity log |
| Development | [`DevelopmentPanel`](../../src/components/settings/panels/development-panel.tsx) | Save all, reset, refresh — shown only when [`usePageCanvasFooterActions`](../../src/hooks/use-page-canvas-footer-actions.ts) reports `visible` |

Dev/sync actions were removed from [`PageCanvasFooter`](../../src/components/canvas/page-canvas-footer.tsx) (footer strip removed from workspace) and from the header menu.

## Appearance / theme

- Schema: [`site-appearance.ts`](../../src/lib/schemas/site-appearance.ts) (`theme`: `light` \| `dark` \| `system`).
- Cookie: `site-appearance` via [`site-appearance-cookie.ts`](../../src/lib/appearance/site-appearance-cookie.ts).
- SSR: [`loadSiteAppearance`](../../src/lib/appearance/load-site-appearance.ts) in root `beforeLoad`; `html.dark` class seeded from [`readSiteAppearanceFromRequest`](../../src/lib/appearance/read-site-appearance.server.ts).
- Client: [`ThemeProvider`](../../src/components/layout/theme-provider.tsx) applies `document.documentElement.classList` and listens to `prefers-color-scheme` when theme is `system`.

## Analytics

IndexedDB store [`page-activity-store.ts`](../../src/db/activity/page-activity-store.ts) records per-page events ([`PageActivityEvent`](../../src/lib/pages/page-activity-events.ts)). [`readAllPageActivityEvents`](../../src/db/activity/page-activity-store.ts) merges across pages (cap `SITE_ACTIVITY_EVENT_CAP` = 2000); aggregators in [`page-activity-analytics.ts`](../../src/lib/pages/page-activity-analytics.ts); [`useSiteActivityAnalytics`](../../src/hooks/use-site-activity-analytics.ts) feeds Recharts panels. Charts use `palette="grey"` on [`ChartContainer`](../../src/components/ui/chart.tsx).

## Phase 2 (not shipped)

- **Colors** — accent presets, global chart palette default.
- **Sidebar** — default width, pin state, tree expansion reset.
