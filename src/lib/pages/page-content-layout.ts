/** Notion-like default reading column on desktop when full width is off. */
export const PAGE_CONTENT_MAX_WIDTH_PX = 708;

/**
 * Class names for the inner content column inside the canvas scroll area.
 *
 * Full width drops the centered `max-w` only — scroll inset padding (`md:px-12`)
 * stays, so the page icon and blocks share the same left edge.
 */
export function pageContentColumnClassName(options: {
  fullWidth: boolean;
  isNarrowViewport: boolean;
}): string {
  const { fullWidth, isNarrowViewport } = options;

  // `text-foreground` is the default text color for canvas content: block-level
  // color classes on each block shell override it, but title and uncolored
  // blocks must not inherit the muted `text-sidebar-foreground` from the
  // surrounding `<main>` (SidebarInset).
  if (isNarrowViewport || fullWidth) {
    return "w-full min-w-0 text-foreground";
  }

  return "mx-auto w-full min-w-0 max-w-[708px] text-foreground";
}

/**
 * Whether the canvas uses the full padded panel width (mobile always; desktop
 * when `fullWidth`). Still inset by scroll padding — not edge-to-edge.
 */
export function resolveUseFullPanelCanvasWidth(options: {
  fullWidth: boolean;
  isNarrowViewport: boolean;
}): boolean {
  return options.fullWidth || options.isNarrowViewport;
}
