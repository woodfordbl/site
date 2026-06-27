/** Notion-like default reading column on desktop when full width is off. */
export const PAGE_CONTENT_MAX_WIDTH_PX = 708;

/** Class names for the inner content column inside the canvas scroll area. */
export function pageContentColumnClassName(options: {
  fullWidth: boolean;
  isNarrowViewport: boolean;
}): string {
  const { fullWidth, isNarrowViewport } = options;

  if (isNarrowViewport || fullWidth) {
    return "w-full min-w-0";
  }

  return "mx-auto w-full min-w-0 max-w-[708px]";
}

/** Whether the canvas uses full panel width (mobile always; desktop when fullWidth). */
export function resolveUseFullPanelCanvasWidth(options: {
  fullWidth: boolean;
  isNarrowViewport: boolean;
}): boolean {
  return options.fullWidth || options.isNarrowViewport;
}
